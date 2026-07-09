"""
graph_client.py – Microsoft Graph API client for SharePoint / Excel operations.

As of v2.0 this client uses the *signed-in user's delegated token*, forwarded
by Electron via the X-MS-Graph-Token request header. The token is passed into
the GraphClient constructor at request time; the previous client-credentials
(MSAL daemon) flow has been removed.

Share URL resolution:
  SharePoint share URL → base64url token → /shares/{token}/driveItem
  → driveId + itemId used for all subsequent workbook calls.
"""

from __future__ import annotations

import base64
import logging
from datetime import date, timedelta
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
_PAGE_SIZE = 200


def _encode_share_url(url: str) -> str:
    """Encode a SharePoint share URL to the Graph API share token format."""
    encoded = base64.urlsafe_b64encode(url.encode()).rstrip(b"=").decode()
    return f"u!{encoded}"


def _excel_serial_to_str(val) -> str:
    """Convert Excel serial date (float like 45654.0) to ISO date string."""
    try:
        n = float(val)
        if n > 1000:
            return (date(1899, 12, 30) + timedelta(days=int(n))).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        pass
    return str(val) if val else ""


class GraphClient:
    """Thin wrapper around Microsoft Graph workbook/table endpoints.

    Construct one per request — the token is short-lived and tied to a user.
    """

    def __init__(self, token: str) -> None:
        if not token:
            raise RuntimeError("GraphClient requires a delegated access token.")
        self._token: str = token
        self._drive_id: str | None = None
        self._item_id: str | None = None

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def _resolve_file(self) -> tuple[str, str]:
        """Return (driveId, itemId) for the configured SharePoint file."""
        if self._drive_id and self._item_id:
            return self._drive_id, self._item_id

        if not config.FILE_URL:
            raise RuntimeError(
                "SHAREPOINT_FILE_URL not configured. "
                "Set it in Settings to enable Excel sync."
            )

        token = _encode_share_url(config.FILE_URL)
        url = f"{GRAPH_BASE}/shares/{token}/driveItem"

        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers=self._headers())
            self._raise_for_status(resp, "resolve share URL")
            data = resp.json()

        self._drive_id = data["parentReference"]["driveId"]
        self._item_id = data["id"]
        logger.info(
            "Resolved SharePoint file: driveId=%s itemId=%s",
            self._drive_id,
            self._item_id,
        )
        return self._drive_id, self._item_id

    def _workbook_url(self, path: str) -> str:
        drive_id, item_id = self._resolve_file()
        return f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/{path}"

    @staticmethod
    def _raise_for_status(response: httpx.Response, context: str = "") -> None:
        if response.status_code >= 400:
            try:
                body = response.json()
                msg = body.get("error", {}).get("message", response.text)
            except Exception:
                msg = response.text
            label = f" [{context}]" if context else ""
            raise RuntimeError(
                f"Graph API error{label} {response.status_code}: {msg}"
            )

    def get_table_headers(self, table_name: str) -> list[str]:
        """Return the list of column header names for *table_name*."""
        url = self._workbook_url(f"tables/{table_name}/columns")
        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers=self._headers())
            self._raise_for_status(resp, f"get headers {table_name}")
            data = resp.json()
        return [col["name"] for col in data.get("value", [])]

    def get_table_rows(self, table_name: str) -> list[dict[str, Any]]:
        """Return all rows from *table_name* as a list of dicts.

        Each dict has column headers as keys plus ``_row_index`` (0-based)
        required for PATCH operations.
        """
        headers = self.get_table_headers(table_name)
        rows: list[dict[str, Any]] = []
        skip = 0

        with httpx.Client(timeout=60) as client:
            while True:
                url = self._workbook_url(
                    f"tables/{table_name}/rows"
                    f"?$top={_PAGE_SIZE}&$skip={skip}"
                )
                resp = client.get(url, headers=self._headers())
                self._raise_for_status(resp, f"get rows {table_name}")
                data = resp.json()
                batch = data.get("value", [])
                if not batch:
                    break
                for row in batch:
                    values: list[Any] = row.get("values", [[]])[0]
                    row_dict = {
                        headers[i]: (values[i] if i < len(values) else None)
                        for i in range(len(headers))
                    }
                    row_dict["_row_index"] = row.get("index", skip + len(rows))
                    rows.append(row_dict)
                if len(batch) < _PAGE_SIZE:
                    break
                skip += _PAGE_SIZE

        return rows

    def update_table_row(
        self,
        table_name: str,
        row_index: int,
        values_dict: dict[str, Any],
        headers: list[str] | None = None,
    ) -> None:
        """PATCH a single row in *table_name* by its 0-based *row_index*."""
        if headers is None:
            headers = self.get_table_headers(table_name)

        values_list = [values_dict.get(h, "") for h in headers]
        url = self._workbook_url(
            f"tables/{table_name}/rows/itemAt(index={row_index})"
        )
        with httpx.Client(timeout=30) as client:
            resp = client.patch(url, headers=self._headers(), json={"values": [values_list]})
            self._raise_for_status(resp, f"update row {table_name}[{row_index}]")

    def add_table_row(
        self,
        table_name: str,
        values_dict: dict[str, Any],
        headers: list[str] | None = None,
    ) -> None:
        """Append a new row to *table_name*."""
        if headers is None:
            headers = self.get_table_headers(table_name)

        values_list = [values_dict.get(h, "") for h in headers]
        url = self._workbook_url(f"tables/{table_name}/rows/add")
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, headers=self._headers(), json={"values": [values_list]})
            self._raise_for_status(resp, f"add row {table_name}")

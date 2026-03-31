"""
GraphClient — MSAL + Microsoft Graph API for SharePoint Excel operations.
Adapted from the proven auth pattern in the root main.py.
"""
import base64
import msal
import requests
from datetime import date, timedelta
from config import TENANT_ID, CLIENT_ID, CLIENT_SECRET, FILE_URL

GRAPH_API = "https://graph.microsoft.com/v1.0"


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
    def __init__(self):
        authority = f"https://login.microsoftonline.com/{TENANT_ID}"
        # Keep a single ConfidentialClientApplication — MSAL caches the token internally
        self._app = msal.ConfidentialClientApplication(
            CLIENT_ID, authority=authority, client_credential=CLIENT_SECRET
        )
        self._drive_id: str | None = None
        self._item_id: str | None = None
        self._session_id: str | None = None  # workbook session for writes

    def _token(self) -> str:
        result = self._app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        if "access_token" not in result:
            raise RuntimeError(
                f"Token acquisition failed: {result.get('error_description', result.get('error'))}"
            )
        return result["access_token"]

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._token()}",
            "Content-Type": "application/json",
        }

    def _resolve_file(self):
        """One-time resolution of driveId and itemId from the SharePoint sharing URL."""
        if self._drive_id:
            return
        # Sharing link → base64url token (same trick as main.py)
        share_token = "u!" + base64.urlsafe_b64encode(
            FILE_URL.encode()
        ).decode().rstrip("=")
        resp = requests.get(
            f"{GRAPH_API}/shares/{share_token}/driveItem",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        self._drive_id = data["parentReference"]["driveId"]
        self._item_id = data["id"]
        print(f"[GraphClient] File resolved: {data['name']}")

    @property
    def _wb(self) -> str:
        """Base URL for all workbook calls."""
        self._resolve_file()
        return f"{GRAPH_API}/drives/{self._drive_id}/items/{self._item_id}/workbook"

    # ── Read helpers ─────────────────────────────────────────────────────────

    def get_table_headers(self, table_name: str) -> list[str]:
        """Returns the ordered column headers for a table."""
        resp = requests.get(
            f"{self._wb}/tables/{table_name}/headerRowRange",
            headers=self._headers(),
        )
        resp.raise_for_status()
        return [str(h) for h in resp.json()["values"][0]]

    def get_table_rows(self, table_name: str) -> list[dict]:
        """
        Returns all rows as a list of dicts: {column: value, '_row_index': N}.
        Handles Graph API pagination (default page = 200 rows).
        """
        headers = self.get_table_headers(table_name)
        all_rows: list[dict] = []
        skip = 0

        while True:
            resp = requests.get(
                f"{self._wb}/tables/{table_name}/rows?$top=200&$skip={skip}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            batch = data.get("value", [])

            for row in batch:
                row_dict = {"_row_index": row["index"]}
                row_dict.update(dict(zip(headers, row["values"][0])))
                all_rows.append(row_dict)

            if len(batch) < 200:
                break
            skip += 200

        return all_rows
    # ── Write helpers ─────────────────────────────────────────────────────────

    def update_table_row(self, table_name: str, row_index: int, values: list):
        """PATCH a single table row by its 0-based index."""
        self._resolve_file()
        url = f"{GRAPH_API}/drives/{self._drive_id}/items/{self._item_id}/workbook/tables/{table_name}/rows/\$/ItemAt(index={row_index})"
        resp = requests.patch(url, json={"values": [values]}, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def add_table_row(self, table_name: str, values: list):
        """POST a new row to the end of a table."""
        self._resolve_file()
        url = f"{GRAPH_API}/drives/{self._drive_id}/items/{self._item_id}/workbook/tables/{table_name}/rows/add"
        resp = requests.post(url, json={"values": [values]}, headers=self._headers())
        resp.raise_for_status()
        return resp.json()


# Module-level singleton — token cache is preserved across all API requests
graph = GraphClient()

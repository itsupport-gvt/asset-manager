"""
Run this ONCE to grant the app service principal write access to the Excel file.
Usage:  python grant_excel_write.py
"""
import requests, json, os, sys
from dotenv import load_dotenv
import msal

load_dotenv()

TENANT_ID = os.getenv("SHAREPOINT_TENANT_ID")
CLIENT_ID = os.getenv("SHAREPOINT_CLIENT_ID")
CLIENT_SECRET = os.getenv("SHAREPOINT_CLIENT_SECRET")
GRAPH = "https://graph.microsoft.com/v1.0"

DRIVE_ID = "b!x0J2PxGCk0mKSRZYnpLJjv6WF6JFXPNMt5MhE-7vmECQEjcjSAXVRIV6xWyvedqF"
ITEM_ID  = "01VKPACT4HUKPOWSMSD5CJQ6S7BZANY3OK"

def get_token():
    app = msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{TENANT_ID}",
        client_credential=CLIENT_SECRET,
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        sys.exit(f"Token error: {result.get('error_description')}")
    return result["access_token"]

token = get_token()
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Step 1: Get Service Principal object ID
sp_r = requests.get(
    f"{GRAPH}/servicePrincipals?$filter=appId eq '{CLIENT_ID}'",
    headers=headers
)
sp_r.raise_for_status()
sps = sp_r.json().get("value", [])
if not sps:
    sys.exit("Could not find the service principal for this app. Check CLIENT_ID.")

sp = sps[0]
sp_id = sp["id"]
sp_name = sp.get("displayName", "Unknown")
print(f"Service Principal: {sp_name} ({sp_id})")

# Step 2: Grant write on the file directly
# Grant the app write access on the specific driveItem
grant_payload = {
    "roles": ["write"],
    "grantedToV2": {
        "application": {
            "id": CLIENT_ID,
            "displayName": sp_name
        }
    }
}

perm_r = requests.post(
    f"{GRAPH}/drives/{DRIVE_ID}/items/{ITEM_ID}/permissions",
    json=grant_payload,
    headers=headers
)
print(f"\nGrant write permission status: {perm_r.status_code}")
try:
    print(json.dumps(perm_r.json(), indent=2))
except:
    print(perm_r.text)

# Step 3: Verify by trying a test write
if perm_r.status_code in (200, 201):
    print("\n--- Testing row add after grant ---")
    test_r = requests.post(
        f"{GRAPH}/drives/{DRIVE_ID}/items/{ITEM_ID}/workbook/tables/MasterTable/rows/add",
        json={"values": [["TEST-DELETE-ME"]]},
        headers=headers
    )
    print("Test write status:", test_r.status_code)
    if test_r.ok:
        print("SUCCESS! Excel write works now.")
    else:
        print("Still failing:", test_r.text[:400])

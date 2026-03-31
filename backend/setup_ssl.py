"""
Generate a self-signed SSL certificate for local HTTPS.

Run once:
    python setup_ssl.py

Then start the server with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem

Why HTTPS is needed:
    Browsers block camera access (getUserMedia) on non-localhost HTTP origins.
    A self-signed cert is sufficient for LAN use — the phone just needs to
    accept the "not secure" warning once.
"""
import datetime
import ipaddress
import socket
from pathlib import Path

CERT_FILE = Path(__file__).parent / "cert.pem"
KEY_FILE  = Path(__file__).parent / "key.pem"
DAYS      = 3650  # ~10 years — never worry about it again


def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    ip = s.getsockname()[0]
    s.close()
    return ip


def generate():
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        print("[!] Missing dependency. Run:  pip install cryptography")
        return

    ip = get_lan_ip()
    print(f"[*] Detected LAN IP: {ip}")
    print(f"[*] Generating {DAYS}-day self-signed certificate...")

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Asset Manager"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Gravity BP"),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=DAYS))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.IPv4Address(ip)),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                x509.DNSName("localhost"),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    KEY_FILE.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )

    print(f"[+] cert.pem and key.pem saved.")
    print()
    print("=" * 60)
    print("  Start server with SSL:")
    print()
    print("  uvicorn main:app --reload --host 0.0.0.0 --port 8000 \\")
    print("    --ssl-keyfile key.pem --ssl-certfile cert.pem")
    print()
    print(f"  Scanner URL: https://{ip}:8000/scanner")
    print()
    print("  On the phone: tap 'Advanced' > 'Proceed to ... (unsafe)'")
    print("  to accept the self-signed cert once. Camera will work after.")
    print("=" * 60)


if __name__ == "__main__":
    if CERT_FILE.exists() and KEY_FILE.exists():
        print("[i] cert.pem and key.pem already exist.")
        print("    Delete them and re-run if you need a new certificate.")
    else:
        generate()

"""Encrypt a paid eBook PDF for the Agrikranti in-app protected reader.
Usage: python3 _src/secure_book.py <book_id> <pdf> <admin_pin>
Writes books/<id>.enc and keys/<id>.json (no plain key or PIN is stored)."""
import os, sys, json, base64, hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
IT = 150000
b64 = lambda b: base64.b64encode(b).decode()
def kdf(secret, salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt.encode(), iterations=IT).derive(secret.encode())
def wrap(key, data):
    iv = os.urandom(12); return {'iv': b64(iv), 'ct': b64(AESGCM(key).encrypt(iv, data, None))}
bid, pdf, pin = sys.argv[1], sys.argv[2], sys.argv[3]
K = os.urandom(32)
iv = os.urandom(12)
os.makedirs('books', exist_ok=True); os.makedirs('keys', exist_ok=True)
open(f'books/{bid}.enc', 'wb').write(iv + AESGCM(K).encrypt(iv, open(pdf, 'rb').read(), None))
ms = f'ak-master-{bid}-{b64(os.urandom(9))}'
master = wrap(kdf(pin, ms), K); master['s'] = ms
roster = wrap(K, json.dumps([]).encode())
json.dump({'v': 1, 'it': IT, 'master': master, 'roster': roster, 'users': {}}, open(f'keys/{bid}.json', 'w'), indent=1)
print('ok', os.path.getsize(f'books/{bid}.enc'))

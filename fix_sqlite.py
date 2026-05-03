import sqlite3
import os

db_path = r'C:\Users\return\.hermes\state.db'

print("Connecting to SQLite database...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Running WAL checkpoint...")
cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
result = cursor.fetchall()
print(f"Checkpoint result: {result}")

conn.close()
print("Done!")

print("\nChecking files after checkpoint:")
for f in os.listdir(os.path.dirname(db_path)):
    if f.startswith('state.db'):
        full_path = os.path.join(os.path.dirname(db_path), f)
        size = os.path.getsize(full_path)
        print(f"  {f}: {size} bytes")
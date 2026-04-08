#!/usr/bin/env python3
import os
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv('DATABASE_URL', 'sqlite:///exam_grading.db')

print("\n" + "="*60)
print("🔍 CONFIGURATION BASE DE DONNÉES")
print("="*60)
print(f"\nDATABASE_URL: {db_url}")

if 'postgresql' in db_url:
    print("\n✅ Application configurée pour PostgreSQL")
    print("⚠️  Problème: Les données sont dans SQLite!")
elif 'sqlite' in db_url:
    print("\n✅ Application configurée pour SQLite")
else:
    print("\n❌ Base de données inconnue")

print("="*60 + "\n")

"""
Script pour créer le compte administrateur initial
✅ CORRIGÉ: Initialise la base de données AVANT de créer l'admin
"""
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Vérifier la connexion PostgreSQL
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_NAME = os.getenv('DB_NAME', 'exam_grader_db')
DB_USER = os.getenv('DB_USER', 'postgres')

print(f"\n🔍 Configuration base de données:")
print(f"   Host: {DB_HOST}")
print(f"   Database: {DB_NAME}")
print(f"   User: {DB_USER}")

# ✅ CORRECTION: Importer init_db pour créer les tables
from models import User, UserRole, get_session, init_db
from flask_bcrypt import Bcrypt
import sys

bcrypt = Bcrypt()

def create_admin():
    print("\n" + "="*60)
    print("🔐 CRÉATION DU COMPTE ADMINISTRATEUR")
    print("="*60 + "\n")
    
    try:
        # ✅ ÉTAPE 1: Initialiser la base de données (créer les tables)
        print("📦 Initialisation de la base de données...")
        init_db()
        print("✅ Tables créées avec succès!\n")
        
    except Exception as e:
        print(f"❌ Erreur lors de l'initialisation de la base de données: {e}")
        print("\n💡 Assurez-vous que:")
        print("   1. PostgreSQL est en cours d'exécution")
        print("   2. La base de données existe: CREATE DATABASE exam_grader_db;")
        print("   3. Les identifiants dans .env sont corrects")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # ✅ ÉTAPE 2: Demander les informations de l'admin
    full_name = input("Nom complet de l'admin: ")
    email = input("Email de l'admin: ")
    password = input("Mot de passe: ")
    
    if not full_name or not email or not password:
        print("\n❌ Erreur: Tous les champs sont requis!")
        sys.exit(1)
    
    try:
        session = get_session()
        
        # Vérifier si l'email existe déjà
        existing = session.query(User).filter_by(email=email).first()
        if existing:
            print(f"\n⚠️  Un utilisateur avec cet email existe déjà:")
            print(f"   Nom: {existing.full_name}")
            print(f"   Rôle: {existing.role.value}")
            
            confirm = input("\n❓ Voulez-vous le supprimer et créer un nouveau compte admin? (oui/non): ")
            if confirm.lower() in ['oui', 'o', 'yes', 'y']:
                session.delete(existing)
                session.commit()
                print("✅ Ancien compte supprimé")
            else:
                print("\n❌ Opération annulée")
                session.close()
                sys.exit(1)
        
        # Créer l'admin
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        
        admin = User(
            email=email,
            password_hash=hashed_password,
            full_name=full_name,
            role=UserRole.ADMIN,
            is_active=True,
            email_verified=True
        )
        
        session.add(admin)
        session.commit()
        
        print("\n" + "="*60)
        print("✅ COMPTE ADMINISTRATEUR CRÉÉ AVEC SUCCÈS!")
        print("="*60)
        print(f"\n📧 Email: {email}")
        print(f"👤 Nom: {full_name}")
        print(f"🔑 Rôle: Administrateur")
        print(f"\n🌐 Connexion:")
        print(f"   URL: http://localhost:7000/app")
        print(f"   Email: {email}")
        print(f"   Password: {password}")
        print("\n" + "="*60 + "\n")
        
        session.close()
        
    except Exception as e:
        print(f"\n❌ Erreur lors de la création: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    create_admin()

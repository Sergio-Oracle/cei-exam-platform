"""
Script de peuplement de la maquette pédagogique
Basé sur Master Télécommunications & Réseaux - Cybersécurité et DevOps
"""
from models import (
    get_session, Formation, Semester, UE, EC,
    User, UserRole, init_db
)
from flask_bcrypt import Bcrypt

bcrypt = Bcrypt()

def create_maquette():
    """Créer la maquette complète de la formation"""
    session = get_session()
    
    try:
        print("\n" + "="*80)
        print("🎓 CRÉATION DE LA MAQUETTE PÉDAGOGIQUE")
        print("="*80 + "\n")
        
        # ====================================================================
        # 1. FORMATION
        # ====================================================================
        formation = Formation(
            code="MASTER_TR_CYBER_DEVOPS",
            name="Master Télécommunications & Réseaux - Options Cybersécurité et DevOps",
            level="Master 1",
            department="Tronc Commun",
            description="Formation complète en télécommunications et réseaux avec spécialisations en cybersécurité et DevOps"
        )
        session.add(formation)
        session.flush()
        print(f"✅ Formation créée: {formation.name}")
        
        # ====================================================================
        # 2. SEMESTRE 1
        # ====================================================================
        semester1 = Semester(
            formation_id=formation.id,
            number=1,
            name="Semestre 1",
            total_credits=30
        )
        session.add(semester1)
        session.flush()
        print(f"\n📚 Semestre 1 créé (30 crédits)")
        
        # UEM111: Informatique générale pour l'ingénieur
        ue111 = UE(
            semester_id=semester1.id,
            code="UEM111",
            name="Informatique générale pour l'ingénieur",
            credits=6
        )
        session.add(ue111)
        session.flush()
        
        ecs_111 = [
            EC(ue_id=ue111.id, code="M1111", name="Bases de données", cm=10, td=10, tp=20, tpe=0, vht=40, coefficient=1),
            EC(ue_id=ue111.id, code="M1112", name="Préparation à la Certification Linux Niveau 2 - LPIC-2", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue111.id, code="M1113", name="Réseaux avancés", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
        ]
        session.add_all(ecs_111)
        print(f"  ✓ {ue111.code}: {ue111.name} ({len(ecs_111)} ECs)")
        
        # UEM112: Spécialisation
        ue112 = UE(
            semester_id=semester1.id,
            code="UEM112",
            name="Spécialisation",
            credits=6
        )
        session.add(ue112)
        session.flush()
        
        ecs_112 = [
            EC(ue_id=ue112.id, code="M1121", name="Administration des services réseaux", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue112.id, code="M1122", name="Téléphonie sur IP et IMS", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue112.id, code="M1123", name="Administration et sécurité des systèmes d'exploitation Windows", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
        ]
        session.add_all(ecs_112)
        print(f"  ✓ {ue112.code}: {ue112.name} ({len(ecs_112)} ECs)")
        
        # UEM113: Approche objet et web services
        ue113 = UE(
            semester_id=semester1.id,
            code="UEM113",
            name="Approche objet et web services",
            credits=6
        )
        session.add(ue113)
        session.flush()
        
        ecs_113 = [
            EC(ue_id=ue113.id, code="M1131", name="Programmation orientée objet (POO)", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue113.id, code="M1132", name="Conception orientée objet UML", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue113.id, code="M1133", name="Architectures Orientées Services 1 (Web Services): SOAP, XML, REST, JSON", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
        ]
        session.add_all(ecs_113)
        print(f"  ✓ {ue113.code}: {ue113.name} ({len(ecs_113)} ECs)")
        
        # UEM114: Déploiement et sécurité des web services
        ue114 = UE(
            semester_id=semester1.id,
            code="UEM114",
            name="Déploiement et sécurité des web services",
            credits=6
        )
        session.add(ue114)
        session.flush()
        
        ecs_114 = [
            EC(ue_id=ue114.id, code="M1141", name="Sécurité des protocoles de communication du web", cm=10, td=10, tp=0, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue114.id, code="M1142", name="Développement d'applications de communications sur web (WebRTC)", cm=10, td=10, tp=0, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue114.id, code="M1143", name="Virtualisation et Cloud Computing", cm=10, td=10, tp=0, tpe=20, vht=40, coefficient=1),
        ]
        session.add_all(ecs_114)
        print(f"  ✓ {ue114.code}: {ue114.name} ({len(ecs_114)} ECs)")
        
        # UEM115: Professionnalisation et Société
        ue115 = UE(
            semester_id=semester1.id,
            code="UEM115",
            name="Professionnalisation et Société",
            credits=6
        )
        session.add(ue115)
        session.flush()
        
        ecs_115 = [
            EC(ue_id=ue115.id, code="M1151", name="Fonctionnement des entreprises et communication", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue115.id, code="M1152", name="Anglais", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
            EC(ue_id=ue115.id, code="M1153", name="Management de projet", cm=10, td=0, tp=10, tpe=20, vht=40, coefficient=1),
        ]
        session.add_all(ecs_115)
        print(f"  ✓ {ue115.code}: {ue115.name} ({len(ecs_115)} ECs)")
        
        # ====================================================================
        # 3. SEMESTRE 2
        # ====================================================================
        semester2 = Semester(
            formation_id=formation.id,
            number=2,
            name="Semestre 2",
            total_credits=30
        )
        session.add(semester2)
        session.flush()
        print(f"\n📚 Semestre 2 créé (30 crédits)")
        
        # UEM121: Ingénierie des réseaux et télécommunications
        ue121 = UE(
            semester_id=semester2.id,
            code="UEM121",
            name="Ingénierie des réseaux et télécommunications",
            credits=6
        )
        session.add(ue121)
        session.flush()
        
        ecs_121 = [
            EC(ue_id=ue121.id, code="M1211", name="Ingénierie des réseaux câblés", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
            EC(ue_id=ue121.id, code="M1212", name="Réseaux programmables: SDN, VXLAN, NFV", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
        ]
        session.add_all(ecs_121)
        print(f"  ✓ {ue121.code}: {ue121.name} ({len(ecs_121)} ECs)")
        
        # UEM122: Spécialisation
        ue122 = UE(
            semester_id=semester2.id,
            code="UEM122",
            name="Spécialisation",
            credits=6
        )
        session.add(ue122)
        session.flush()
        
        ecs_122 = [
            EC(ue_id=ue122.id, code="M1221", name="Administration et supervision des réseaux", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
            EC(ue_id=ue122.id, code="M1222", name="Evolution des architectures des réseaux de télécommunications", cm=15, td=5, tp=10, tpe=30, vht=60, coefficient=1),
        ]
        session.add_all(ecs_122)
        print(f"  ✓ {ue122.code}: {ue122.name} ({len(ecs_122)} ECs)")
        
        # UEM123: Préparation aux services innovants
        ue123 = UE(
            semester_id=semester2.id,
            code="UEM123",
            name="Préparation aux services innovants",
            credits=6
        )
        session.add(ue123)
        session.flush()
        
        ecs_123 = [
            EC(ue_id=ue123.id, code="M1231", name="JavaScript avancé", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
            EC(ue_id=ue123.id, code="M1232", name="Environnements de développement d'applications mobiles", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
        ]
        session.add_all(ecs_123)
        print(f"  ✓ {ue123.code}: {ue123.name} ({len(ecs_123)} ECs)")
        
        # UEM124: Cybersécurité et IA
        ue124 = UE(
            semester_id=semester2.id,
            code="UEM124",
            name="Cybersécurité et IA",
            credits=6
        )
        session.add(ue124)
        session.flush()
        
        ecs_124 = [
            EC(ue_id=ue124.id, code="M1241", name="Cybersécurité: concepts et mise en oeuvre", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
            EC(ue_id=ue124.id, code="M1242", name="Machine learning", cm=10, td=0, tp=20, tpe=30, vht=60, coefficient=1),
        ]
        session.add_all(ecs_124)
        print(f"  ✓ {ue124.code}: {ue124.name} ({len(ecs_124)} ECs)")
        
        # UEM125: Pratique managériale
        ue125 = UE(
            semester_id=semester2.id,
            code="UEM125",
            name="Pratique managériale",
            credits=6
        )
        session.add(ue125)
        session.flush()
        
        ecs_125 = [
            EC(ue_id=ue125.id, code="M1251", name="Projet transversal de développement d'applications", cm=10, td=0, tp=0, tpe=30, vht=40, coefficient=1),
            EC(ue_id=ue125.id, code="M1252", name="Projet Tutoré", cm=10, td=0, tp=0, tpe=30, vht=40, coefficient=1),
            EC(ue_id=ue125.id, code="M1253", name="Projet Télécommunications (billing des opérateurs, médiation et supervision)", cm=10, td=0, tp=0, tpe=30, vht=40, coefficient=1),
        ]
        session.add_all(ecs_125)
        print(f"  ✓ {ue125.code}: {ue125.name} ({len(ecs_125)} ECs)")
        
        # ====================================================================
        # 4. COMMIT
        # ====================================================================
        session.commit()
        
        # Statistiques
        total_ues = session.query(UE).count()
        total_ecs = session.query(EC).count()
        
        print("\n" + "="*80)
        print("📊 STATISTIQUES")
        print("="*80)
        print(f"✅ 1 Formation créée")
        print(f"✅ 2 Semestres créés")
        print(f"✅ {total_ues} UEs créées")
        print(f"✅ {total_ecs} ECs créés")
        print("="*80 + "\n")
        
    except Exception as e:
        session.rollback()
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        session.close()

def create_test_professors():
    """Créer des professeurs de test pour chaque EC"""
    session = get_session()
    
    try:
        print("\n" + "="*80)
        print("👨‍🏫 CRÉATION DES PROFESSEURS")
        print("="*80 + "\n")
        
        # Vérifier si les professeurs existent déjà
        existing = session.query(User).filter_by(email='nasry.ahamadi@esp.sn').first()
        if existing:
            print("⚠️ Les professeurs existent déjà")
            return
        
        professors = [
            {
                'full_name': 'Nasry Ahamadi',
                'email': 'nasry.ahamadi@esp.sn',
                'password': 'Prof123!'
            },
            {
                'full_name': 'MBAYE NDIAYE SAMB',
                'email': 'mbaye.samb@esp.sn',
                'password': 'Prof123!'
            },
            {
                'full_name': 'Dr. Amadou BA',
                'email': 'amadou.ba@esp.sn',
                'password': 'Prof123!'
            }
        ]
        
        for prof_data in professors:
            hashed_password = bcrypt.generate_password_hash(prof_data['password']).decode('utf-8')
            professor = User(
                email=prof_data['email'],
                password_hash=hashed_password,
                full_name=prof_data['full_name'],
                role=UserRole.PROFESSOR,
                is_active=True
            )
            session.add(professor)
            print(f"✅ Professeur créé: {prof_data['full_name']} ({prof_data['email']})")
        
        session.commit()
        print("\n✅ Tous les professeurs ont été créés avec le mot de passe: Prof123!")
        
    except Exception as e:
        session.rollback()
        print(f"\n❌ ERREUR: {e}")
    finally:
        session.close()

if __name__ == '__main__':
    # Initialiser la base
    init_db()
    
    # Créer la maquette
    create_maquette()
    
    # Créer les professeurs
    create_test_professors()
    
    print("\n✅ SETUP COMPLET TERMINÉ!\n")

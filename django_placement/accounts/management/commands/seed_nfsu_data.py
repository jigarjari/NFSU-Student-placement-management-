from decimal import Decimal
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone

from accounts.models import UserProfile, UserRole
from academics.models import Department, Course, StudentAcademicRecord, VerificationStatus, PlacementStatus, CategoryTier
from companies.models import Company, CompanyApprovalStatus, RecruiterMembership
from placements.models import PlacementPolicy, PlacementDrive, DriveStatus, OfferType
from applications.models import Application, ApplicationStatus, Offer, OfferStatus
from auditlog.services import log_security_event


class Command(BaseCommand):
    help = 'Seeds realistic NFSU placement data covering all 5 roles, policies, drives, and Clause 3.2 edge cases'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Initializing NFSU Placement System Seed..."))

        # 1. Global Placement Policy
        policy, created = PlacementPolicy.objects.get_or_create(
            version="2026-27.v1",
            defaults={
                'title': "NFSU Placement Guidelines 2026–27",
                'tier_a_plus_min': Decimal('16.00'),
                'tier_a_min': Decimal('10.00'),
                'tier_b_min': Decimal('6.00'),
                'tier_b_switching_multiplier': Decimal('1.50'),
                'absenteeism_penalty_drives': 3,
                'offer_acceptance_window_hours': 24,
                'is_active': True
            }
        )
        self.stdout.write(self.style.SUCCESS(f"Placement Policy active: {policy.version}"))

        # 2. Departments & Courses
        dept_scsdf, _ = Department.objects.get_or_create(
            code="SCSDF",
            defaults={'name': "School of Cyber Security & Digital Forensics"}
        )
        dept_sfs, _ = Department.objects.get_or_create(
            code="SFS",
            defaults={'name': "School of Forensic Science"}
        )

        # 3. Create Key Evaluation Users
        # Admin
        admin_user, _ = User.objects.get_or_create(
            username="admin",
            defaults={'email': "admin@nfsu.ac.in", 'first_name': "Prof. Dr. Vikram S. Mehta"}
        )
        admin_user.set_password("Admin@NFSU2026!")
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
        UserProfile.objects.update_or_create(
            user=admin_user,
            defaults={'role': UserRole.ADMIN, 'full_name': "Prof. Dr. Vikram S. Mehta", 'phone_number': "+91 79 2397 7100"}
        )

        # Placement Officer
        officer_user, _ = User.objects.get_or_create(
            username="officer",
            defaults={'email': "placement.officer@nfsu.ac.in", 'first_name': "Dr. Ananya Sharma"}
        )
        officer_user.set_password("Officer@NFSU2026!")
        officer_user.save()
        UserProfile.objects.update_or_create(
            user=officer_user,
            defaults={'role': UserRole.OFFICER, 'full_name': "Dr. Ananya Sharma", 'phone_number': "+91 98765 43210"}
        )

        # Course Coordinator (M.Sc. DFIS)
        coord_user, _ = User.objects.get_or_create(
            username="coord_dfis",
            defaults={'email': "r.patel@nfsu.ac.in", 'first_name': "Dr. Rajeshwar Patel"}
        )
        coord_user.set_password("Coord@NFSU2026!")
        coord_user.save()
        UserProfile.objects.update_or_create(
            user=coord_user,
            defaults={'role': UserRole.COORDINATOR, 'full_name': "Dr. Rajeshwar Patel", 'phone_number': "+91 98765 12345"}
        )

        # Assign coordinator to Course
        course_dfis, _ = Course.objects.get_or_create(
            code="MSC_DFIS",
            defaults={
                'name': "M.Sc. Digital Forensics and Information Security",
                'department': dept_scsdf,
                'coordinator': coord_user
            }
        )
        course_dfis.coordinator = coord_user
        course_dfis.save()

        course_mtech_cs, _ = Course.objects.get_or_create(
            code="MTECH_CS",
            defaults={
                'name': "M.Tech. Cyber Security",
                'department': dept_scsdf
            }
        )

        # 4. Companies
        company_google, _ = Company.objects.get_or_create(
            name="Google India Pvt Ltd",
            defaults={
                'industry': "Cloud Computing & Cybersecurity",
                'headquarters_city': "Bengaluru / Hyderabad",
                'website': "https://careers.google.com",
                'contact_email': "campus-india@google.com",
                'approval_status': CompanyApprovalStatus.APPROVED,
                'approved_by': officer_user,
                'description': "Global leader in technology, cloud infrastructure, AI, and cybersecurity engineering."
            }
        )

        company_cisco, _ = Company.objects.get_or_create(
            name="Cisco Systems India",
            defaults={
                'industry': "Enterprise Networking & SOC Security",
                'headquarters_city': "Bengaluru",
                'website': "https://jobs.cisco.com",
                'contact_email': "cisco-university@cisco.com",
                'approval_status': CompanyApprovalStatus.APPROVED,
                'approved_by': officer_user,
                'description': "World leader in networking for the Internet, security operations, and zero-trust systems."
            }
        )

        company_pending, _ = Company.objects.get_or_create(
            name="CyberX Forensic Solutions",
            defaults={
                'industry': "Incident Response & Forensics",
                'headquarters_city': "Gandhinagar",
                'website': "https://cyberxforensics.example.com",
                'contact_email': "hr@cyberxforensics.example.com",
                'approval_status': CompanyApprovalStatus.PENDING,
                'description': "Emerging cyber investigations and memory forensic consultancy firm."
            }
        )

        # Recruiter
        recruiter_user, _ = User.objects.get_or_create(
            username="recruiter_google",
            defaults={'email': "sjenkins@google.com", 'first_name': "Sarah Jenkins"}
        )
        recruiter_user.set_password("Recruiter@NFSU2026!")
        recruiter_user.save()
        UserProfile.objects.update_or_create(
            user=recruiter_user,
            defaults={'role': UserRole.RECRUITER, 'full_name': "Sarah Jenkins", 'phone_number': "+91 99887 76655"}
        )
        RecruiterMembership.objects.update_or_create(
            user=recruiter_user,
            defaults={'company': company_google, 'designation': "Lead Technical Recruiter", 'is_company_admin': True}
        )

        # 5. Placement Drives
        # Drive 1: Google (Tier A+ >= 16.0 LPA, 18.0 LPA)
        drive_google, _ = PlacementDrive.objects.get_or_create(
            company=company_google,
            job_title="Associate Threat Intelligence Analyst",
            defaults={
                'job_description': "Investigate advanced persistent threats (APT), analyze malicious telemetry, and support global incident response teams.",
                'offer_type': OfferType.FTE,
                'category': CategoryTier.A_PLUS,
                'ctc_lpa': Decimal('18.00'),
                'stipend_monthly': Decimal('60000.00'),
                'min_cgpa': Decimal('7.00'),
                'max_active_backlogs': 0,
                'deadline': timezone.now() + timedelta(days=14),
                'drive_date': (timezone.now() + timedelta(days=16)).date(),
                'location': "NFSU Gandhinagar Campus / Google Bengaluru",
                'status': DriveStatus.PUBLISHED,
                'created_by': recruiter_user,
                'approved_by': officer_user
            }
        )
        drive_google.eligible_courses.set([course_dfis, course_mtech_cs])

        # Drive 2: Cisco (Tier B, 9.5 LPA)
        drive_cisco, _ = PlacementDrive.objects.get_or_create(
            company=company_cisco,
            job_title="Security Operations Center (SOC) Analyst",
            defaults={
                'job_description': "Monitor network intrusion detection pipelines, configure SIEM dashboards, and triage security alarms.",
                'offer_type': OfferType.FTE,
                'category': CategoryTier.B,
                'ctc_lpa': Decimal('9.50'),
                'stipend_monthly': Decimal('35000.00'),
                'min_cgpa': Decimal('6.50'),
                'max_active_backlogs': 0,
                'deadline': timezone.now() + timedelta(days=10),
                'drive_date': (timezone.now() + timedelta(days=12)).date(),
                'location': "Virtual / NFSU Cyber Lab",
                'status': DriveStatus.PUBLISHED,
                'created_by': officer_user,
                'approved_by': officer_user
            }
        )
        drive_cisco.eligible_courses.set([course_dfis, course_mtech_cs])

        # 6. Student Evaluation Personas

        # Student 1: student_aplus (CGPA 9.20, already placed in Tier A+ at 22 LPA -> FROZEN from other drives)
        s1, _ = User.objects.get_or_create(
            username="student_aplus",
            defaults={'email': "aarav.sharma@students.nfsu.ac.in", 'first_name': "Aarav Sharma"}
        )
        s1.set_password("Student@NFSU2026!")
        s1.save()
        UserProfile.objects.update_or_create(user=s1, defaults={'role': UserRole.STUDENT, 'full_name': "Aarav Sharma"})
        StudentAcademicRecord.objects.update_or_create(
            user=s1,
            defaults={
                'enrollment_number': "NFSU2024DFIS01",
                'course': course_dfis,
                'cgpa': Decimal('9.20'),
                'active_backlogs': 0,
                'historical_backlogs': 0,
                'graduation_year': 2026,
                'verification_status': VerificationStatus.VERIFIED,
                'verified_by': coord_user,
                'current_placement_status': PlacementStatus.PLACED_FTE,
                'current_company': "Microsoft India",
                'current_ctc': Decimal('22.00'),
                'current_tier': CategoryTier.A_PLUS
            }
        )

        # Student 2: student_b (CGPA 8.40, placed in Tier B at 7.0 LPA -> Eligible for Google 18.0 LPA because 18.0 >= 1.5*7.0=10.5, but ineligible for Cisco 9.5 LPA because 9.5 < 10.5!)
        s2, _ = User.objects.get_or_create(
            username="student_b",
            defaults={'email': "pooja.patel@students.nfsu.ac.in", 'first_name': "Pooja Patel"}
        )
        s2.set_password("Student@NFSU2026!")
        s2.save()
        UserProfile.objects.update_or_create(user=s2, defaults={'role': UserRole.STUDENT, 'full_name': "Pooja Patel"})
        StudentAcademicRecord.objects.update_or_create(
            user=s2,
            defaults={
                'enrollment_number': "NFSU2024DFIS02",
                'course': course_dfis,
                'cgpa': Decimal('8.40'),
                'active_backlogs': 0,
                'historical_backlogs': 0,
                'graduation_year': 2026,
                'verification_status': VerificationStatus.VERIFIED,
                'verified_by': coord_user,
                'current_placement_status': PlacementStatus.PLACED_FTE,
                'current_company': "Infosys Cyber Defense",
                'current_ctc': Decimal('7.00'),
                'current_tier': CategoryTier.B
            }
        )

        # Student 3: student_unplaced (CGPA 8.00, verified, 0 backlogs -> Demonstrates prompt scenario 3 & 5: Passes CGPA 7.0 requirement and applies successfully)
        s3, _ = User.objects.get_or_create(
            username="student_unplaced",
            defaults={'email': "rohan.verma@students.nfsu.ac.in", 'first_name': "Rohan Verma"}
        )
        s3.set_password("Student@NFSU2026!")
        s3.save()
        UserProfile.objects.update_or_create(user=s3, defaults={'role': UserRole.STUDENT, 'full_name': "Rohan Verma"})
        StudentAcademicRecord.objects.update_or_create(
            user=s3,
            defaults={
                'enrollment_number': "NFSU2024DFIS03",
                'course': course_dfis,
                'cgpa': Decimal('8.00'),
                'active_backlogs': 0,
                'historical_backlogs': 0,
                'graduation_year': 2026,
                'verification_status': VerificationStatus.VERIFIED,
                'verified_by': coord_user,
                'current_placement_status': PlacementStatus.UNPLACED
            }
        )

        # Student 4: student_ineligible (CGPA 6.00, verified -> Demonstrates prompt scenario 4: Denied eligibility for Google drive requiring CGPA 7.0)
        s4, _ = User.objects.get_or_create(
            username="student_ineligible",
            defaults={'email': "neha.joshi@students.nfsu.ac.in", 'first_name': "Neha Joshi"}
        )
        s4.set_password("Student@NFSU2026!")
        s4.save()
        UserProfile.objects.update_or_create(user=s4, defaults={'role': UserRole.STUDENT, 'full_name': "Neha Joshi"})
        StudentAcademicRecord.objects.update_or_create(
            user=s4,
            defaults={
                'enrollment_number': "NFSU2024DFIS04",
                'course': course_dfis,
                'cgpa': Decimal('6.00'),
                'active_backlogs': 1,
                'historical_backlogs': 1,
                'graduation_year': 2026,
                'verification_status': VerificationStatus.VERIFIED,
                'verified_by': coord_user,
                'current_placement_status': PlacementStatus.UNPLACED
            }
        )

        # Student 5: student_absent (CGPA 8.10, but has active ban penalty for unexcused interview absence)
        s5, _ = User.objects.get_or_create(
            username="student_absent",
            defaults={'email': "kunal.mehra@students.nfsu.ac.in", 'first_name': "Kunal Mehra"}
        )
        s5.set_password("Student@NFSU2026!")
        s5.save()
        UserProfile.objects.update_or_create(user=s5, defaults={'role': UserRole.STUDENT, 'full_name': "Kunal Mehra"})
        StudentAcademicRecord.objects.update_or_create(
            user=s5,
            defaults={
                'enrollment_number': "NFSU2024DFIS05",
                'course': course_dfis,
                'cgpa': Decimal('8.10'),
                'active_backlogs': 0,
                'graduation_year': 2026,
                'verification_status': VerificationStatus.VERIFIED,
                'verified_by': coord_user,
                'absent_penalty_drives': 2,
                'current_placement_status': PlacementStatus.UNPLACED
            }
        )

        # 7. Sample Initial Application & Pending Offer
        app_b, _ = Application.objects.get_or_create(
            student=s2,
            drive=drive_google,
            defaults={
                'status': ApplicationStatus.OFFERED,
                'eval_policy_version': policy.version
            }
        )
        # Create a 24h pending offer for student_b
        Offer.objects.get_or_create(
            application=app_b,
            defaults={
                'package_ctc': Decimal('18.00'),
                'stipend': Decimal('60000.00'),
                'offer_letter_ref': f"NFSU/GOOG/{timezone.now().year}/001",
                'deadline_window': timezone.now() + timedelta(hours=22),
                'status': OfferStatus.PENDING
            }
        )

        # Log genesis seed event
        log_security_event(
            actor=admin_user,
            action='SEED_NFSU_SYSTEM_DATA',
            target_model='SYSTEM',
            target_id='ALL',
            outcome='SUCCESS',
            details="Seeded complete NFSU institutional placement records with all 5 evaluation personas and policy rules."
        )

        self.stdout.write(self.style.SUCCESS("NFSU Placement Management System Seeded Successfully!"))
        self.stdout.write(self.style.SUCCESS("All 5 roles created with passwords ready for evaluation."))

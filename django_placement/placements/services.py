from decimal import Decimal
from django.utils import timezone
from academics.models import VerificationStatus, CategoryTier, PlacementStatus
from .models import PlacementPolicy, DriveStatus


class PlacementEligibilityEngine:
    """
    Centralized NFSU Policy-Driven Placement Eligibility Engine.
    Evaluates candidate academic records against recruitment drives and institutional guidelines.
    Returns structured decisions: { is_eligible: bool, code: str, reason: str, clause: str, violations: list, checks_passed: list }
    """

    @classmethod
    def get_active_policy(cls):
        policy = PlacementPolicy.objects.filter(is_active=True).first()
        if not policy:
            policy = PlacementPolicy.objects.create(
                title="NFSU Placement Guidelines 2026–27",
                version="2026-27.v1",
                tier_a_plus_min=Decimal('16.00'),
                tier_a_min=Decimal('10.00'),
                tier_b_min=Decimal('6.00'),
                tier_b_switching_multiplier=Decimal('1.50'),
                absenteeism_penalty_drives=3,
                is_active=True
            )
        return policy

    @classmethod
    def evaluate(cls, student_record, drive, policy=None):
        if not policy:
            policy = cls.get_active_policy()

        checks_passed = []
        violations = []

        # 1. Drive Status Check
        if drive.status != DriveStatus.PUBLISHED:
            return {
                'is_eligible': False,
                'code': 'DRIVE_NOT_PUBLISHED',
                'clause': 'Section 3.1: Drive Publication Workflow',
                'reason': f"Recruitment drive status is '{drive.get_status_display()}'. Applications are not open.",
                'violations': ['Drive is not in Published status'],
                'checks_passed': []
            }

        # 2. Application Deadline Check
        if drive.is_expired:
            return {
                'is_eligible': False,
                'code': 'DEADLINE_PASSED',
                'clause': 'Section 3.2: Drive Registration Deadlines',
                'reason': f"Application deadline closed on {drive.deadline.strftime('%d-%b-%Y %H:%M')}.",
                'violations': ['Drive application deadline has passed'],
                'checks_passed': []
            }
        checks_passed.append("Application deadline is active")

        # 3. Registration / Deregistration Check
        if student_record.is_deregistered:
            return {
                'is_eligible': False,
                'code': 'STUDENT_DEREGISTERED',
                'clause': 'Section 3.1: Placement Registration Requirement',
                'reason': "Student has been deregistered from campus placements under NFSU Policy.",
                'violations': ['Student account is deregistered'],
                'checks_passed': checks_passed
            }
        checks_passed.append("Student registration is active")

        # 4. Academic Verification Status Check
        if student_record.verification_status != VerificationStatus.VERIFIED:
            status_label = student_record.get_verification_status_display()
            return {
                'is_eligible': False,
                'code': 'ACADEMIC_RECORD_UNVERIFIED',
                'clause': 'Section 3.1: Academic Record Verification Requirement',
                'reason': f"Academic record is '{status_label}'. Coordinator verification is required prior to applying.",
                'violations': [f"Verification status: {status_label}"],
                'checks_passed': checks_passed
            }
        checks_passed.append("Academic record verified by Course Coordinator")

        # 5. Clause 3.2 Absenteeism Disciplinary Sanction Check
        if student_record.absent_penalty_drives > 0:
            return {
                'is_eligible': False,
                'code': 'ABSENTEEISM_PENALTY_ACTIVE',
                'clause': 'Section 3.2: Attendance and Absenteeism Policy (Clause 3.2)',
                'reason': f"Disciplinary ban active: Student is excluded from the next {student_record.absent_penalty_drives} drive(s) due to unexcused recruitment absence.",
                'violations': [f"Active ban on {student_record.absent_penalty_drives} upcoming drive(s)"],
                'checks_passed': checks_passed
            }
        checks_passed.append("No active absenteeism disciplinary exclusion")

        # 6. Programme / Course Compatibility Check
        eligible_course_ids = list(drive.eligible_courses.values_list('id', flat=True))
        if eligible_course_ids and student_record.course.id not in eligible_course_ids:
            return {
                'is_eligible': False,
                'code': 'COURSE_INELIGIBLE',
                'clause': 'Section 2 & 3.2: Programme-Specific Eligibility',
                'reason': f"Drive is restricted to selected academic programmes. Student is enrolled in '{student_record.course.name}'.",
                'violations': [f"Course {student_record.course.name} is not in eligible list"],
                'checks_passed': checks_passed
            }
        checks_passed.append(f"Programme matches drive criteria ({student_record.course.name})")

        # 7. Minimum CGPA Check
        if student_record.cgpa < drive.min_cgpa:
            return {
                'is_eligible': False,
                'code': 'CGPA_CRITERIA_UNMET',
                'clause': 'Section 3.2: Academic Threshold Criteria',
                'reason': f"Company requires minimum CGPA of {drive.min_cgpa}. Student CGPA is {student_record.cgpa}.",
                'violations': [f"Student CGPA ({student_record.cgpa}) < required CGPA ({drive.min_cgpa})"],
                'checks_passed': checks_passed
            }
        checks_passed.append(f"CGPA meets threshold ({student_record.cgpa} >= {drive.min_cgpa})")

        # 8. Active Backlogs Check
        if student_record.active_backlogs > drive.max_active_backlogs:
            return {
                'is_eligible': False,
                'code': 'BACKLOG_CRITERIA_UNMET',
                'clause': 'Section 3.2: Academic Progression Criteria',
                'reason': f"Drive allows max {drive.max_active_backlogs} active backlog(s). Student has {student_record.active_backlogs}.",
                'violations': [f"Student has {student_record.active_backlogs} active backlogs"],
                'checks_passed': checks_passed
            }
        checks_passed.append(f"Active backlogs satisfied ({student_record.active_backlogs} <= {drive.max_active_backlogs})")

        # 9. Graduation Year Check
        if student_record.graduation_year != drive.graduation_year:
            return {
                'is_eligible': False,
                'code': 'GRADUATION_YEAR_MISMATCH',
                'clause': 'Section 3.2: Batch Cohort Matching',
                'reason': f"Drive is open to {drive.graduation_year} passing cohort. Student graduation year is {student_record.graduation_year}.",
                'violations': [f"Cohort mismatch: expected {drive.graduation_year}, actual {student_record.graduation_year}"],
                'checks_passed': checks_passed
            }
        checks_passed.append(f"Graduation cohort matches ({student_record.graduation_year})")

        # 10. Policy Switching Rules for Currently Placed Students (Clause 3.2)
        if student_record.current_placement_status == PlacementStatus.UNPLACED:
            # Unplaced students can apply immediately!
            return {
                'is_eligible': True,
                'code': 'ELIGIBLE_UNPLACED',
                'clause': 'Section 3.2: Initial Placement Opportunity',
                'reason': "Student meets all academic and registration criteria and is currently unplaced.",
                'violations': [],
                'checks_passed': checks_passed
            }

        # Placed Student Rule Evaluation:
        
        # Rule 10a: Category A+ (>= 16 LPA) Complete Lockout
        if student_record.current_tier == CategoryTier.A_PLUS:
            return {
                'is_eligible': False,
                'code': 'CATEGORY_A_PLUS_LOCKED',
                'clause': 'Section 3.2 Category A+ Policy: Placement Process Lockout',
                'reason': f"Student has secured a Category A+ placement at {student_record.current_company} (₹{student_record.current_ctc} LPA). Under Clause 3.2, Category A+ offer holders are completely out of the campus placement process.",
                'violations': ['Category A+ offer holder is barred from all subsequent drives'],
                'checks_passed': checks_passed
            }

        # Rule 10b: Dual I+F Offer Lock
        if student_record.current_placement_status == PlacementStatus.PLACED_IF:
            return {
                'is_eligible': False,
                'code': 'IF_OFFER_LOCKED',
                'clause': 'Section 3.2: Internship + FTE Dual Offer Lock',
                'reason': f"Student holds a combined Internship + FTE offer at {student_record.current_company}. Barred from all other organizations.",
                'violations': ['I+F offer holder locked across all companies'],
                'checks_passed': checks_passed
            }

        # Rule 10c: Category A Offer Holders (10-16 LPA) -> Can switch ONLY to Category A+
        if student_record.current_tier == CategoryTier.A:
            if drive.category != CategoryTier.A_PLUS:
                return {
                    'is_eligible': False,
                    'code': 'CATEGORY_A_ONLY_SWITCH_TO_A_PLUS',
                    'clause': 'Section 3.2 Category A Policy: Upgrade to Category A+ Only',
                    'reason': f"Student holds a Category A offer at {student_record.current_company} (₹{student_record.current_ctc} LPA). Under Section 3.2, switching is permitted ONLY to Category A+ companies (>= ₹{policy.tier_a_plus_min} LPA). Target drive is in {drive.get_category_display()}.",
                    'violations': [f"Target drive category {drive.category} is not A+"],
                    'checks_passed': checks_passed
                }
            checks_passed.append("Category A student upgrading to Category A+ allowed")

        # Rule 10d: Category B Offer Holders (6-10 LPA) -> 1.5x Multiplier Rule
        if student_record.current_tier == CategoryTier.B:
            min_required_ctc = student_record.current_ctc * policy.tier_b_switching_multiplier
            if drive.ctc_lpa < min_required_ctc:
                return {
                    'is_eligible': False,
                    'code': 'CATEGORY_B_MULTIPLIER_UNMET',
                    'clause': 'Section 3.2 Category B Policy: 1.5x Switching Multiplier Rule',
                    'reason': f"Student holds Category B offer at {student_record.current_company} (₹{student_record.current_ctc} LPA). Switching requires target package to be at least {policy.tier_b_switching_multiplier}x (₹{min_required_ctc:.2f} LPA). Target package is ₹{drive.ctc_lpa} LPA.",
                    'violations': [f"Target CTC (₹{drive.ctc_lpa} LPA) < Required 1.5x CTC (₹{min_required_ctc:.2f} LPA)"],
                    'checks_passed': checks_passed
                }
            checks_passed.append(f"Package meets 1.5x switching multiplier ({drive.ctc_lpa} >= {min_required_ctc:.2f} LPA)")

        # Rule 10e: Category C Offer Holders (< 6 LPA) -> Upgrades allowed (B, A, A+), lateral C to C blocked
        if student_record.current_tier == CategoryTier.C:
            if drive.category == CategoryTier.C:
                return {
                    'is_eligible': False,
                    'code': 'CATEGORY_C_LATERAL_BLOCKED',
                    'clause': 'Section 3.2 Category C Opportunity Policy: Lateral Switch Blocked',
                    'reason': f"Student already holds a Category C offer at {student_record.current_company} (₹{student_record.current_ctc} LPA). Under Clause 3.2, Category C students are eligible for higher-tier opportunities (B, A, A+). Lateral switching to another Category C offer is not permitted.",
                    'violations': ['Lateral Category C to Category C switch is blocked'],
                    'checks_passed': checks_passed
                }
            checks_passed.append(f"Category C upgrade to higher tier ({drive.category}) permitted")

        return {
            'is_eligible': True,
            'code': 'ELIGIBLE_UPGRADE_ALLOWED',
            'clause': 'Section 3.2: Policy-Compliant Subsequent Opportunity',
            'reason': "Student meets all eligibility thresholds and complies with institutional switching criteria.",
            'violations': [],
            'checks_passed': checks_passed
        }

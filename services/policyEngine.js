/**
 * NFSU Student Placement Guidelines 2026–27 Policy Rule Engine
 * Evaluates student eligibility for recruitment drives and offer switching.
 * Produces structured decisions: ALLOWED, BLOCKED, or REFERRED_FOR_REVIEW
 * with clear policy clause justifications.
 */

// Default configurable policy parameters
const DEFAULT_POLICY_CONFIG = {
  categoryThresholds: {
    A_PLUS: 16.0, // >= 16 LPA
    A: 10.0,      // 10.0 to < 16 LPA
    B: 6.0,       // 6.0 to < 10 LPA
    C: 0.0        // < 6 LPA
  },
  switchingMultipliers: {
    B_TO_NEW: 1.5 // New package must be at least 1.5x existing package
  },
  defaultOfferDeadlineHours: 24,
  absenteeismPenaltyDrives: 3
};

let currentConfig = { ...DEFAULT_POLICY_CONFIG };

function getPolicyConfig() {
  return currentConfig;
}

function updatePolicyConfig(newConfig) {
  currentConfig = {
    ...currentConfig,
    ...newConfig,
    categoryThresholds: { ...currentConfig.categoryThresholds, ...(newConfig.categoryThresholds || {}) },
    switchingMultipliers: { ...currentConfig.switchingMultipliers, ...(newConfig.switchingMultipliers || {}) }
  };
  return currentConfig;
}

/**
 * Determine company / offer category based on FTE package (LPA)
 */
function determineCategory(ctcLpa) {
  const ctc = parseFloat(ctcLpa) || 0;
  if (ctc >= currentConfig.categoryThresholds.A_PLUS) return 'A+';
  if (ctc >= currentConfig.categoryThresholds.A) return 'A';
  if (ctc >= currentConfig.categoryThresholds.B) return 'B';
  return 'C';
}

/**
 * Evaluates whether a student can participate in or receive an offer from a prospective drive.
 * @param {Object} student - Student record
 * @param {Object} driveOrOffer - Prospective recruitment drive or offer details
 * @param {Object} options - Options such as hasApprovedException
 * @returns {Object} { status: 'ALLOWED'|'BLOCKED'|'REFERRED_FOR_REVIEW', code: string, reason: string, details: object }
 */
function evaluateEligibility(student, driveOrOffer, options = {}) {
  const result = {
    status: 'ALLOWED',
    code: 'ELIGIBLE_OK',
    reason: 'Student meets all registration, academic, and policy switching guidelines.',
    policyClause: 'Section 3.2 (NFSU Placement Guidelines 2026–27)',
    checksPassed: [],
    violations: [],
    details: {}
  };

  // 1. Basic Registration Verification
  if (!student.registration_status || student.registration_status !== 'Registered') {
    return {
      status: 'BLOCKED',
      code: 'REGISTRATION_INVALID',
      policyClause: 'Section 3.1 & 3.2: Placement Registration Requirement',
      reason: `Student registration status is '${student.registration_status || 'Not registered'}'. Only actively registered students may participate in recruitment drives.`,
      violations: [`Registration status: ${student.registration_status || 'Not registered'}`]
    };
  }
  result.checksPassed.push('Placement Registration verified (Active)');

  // 2. Academic / Verification Status Check
  if (student.eligibility_status === 'Ineligible') {
    return {
      status: 'BLOCKED',
      code: 'ACADEMIC_INELIGIBLE',
      policyClause: 'Section 3.1: Academic Eligibility Verification',
      reason: 'Student has been marked as Ineligible by the Course Coordinator or Placement Cell.',
      violations: ['Eligibility status is Ineligible']
    };
  }
  if (student.eligibility_status === 'Pending verification') {
    return {
      status: 'REFERRED_FOR_REVIEW',
      code: 'VERIFICATION_PENDING',
      policyClause: 'Section 3.1: Academic Eligibility Verification',
      reason: 'Student eligibility is currently Pending verification. Referral sent to Course Coordinator for approval.',
      violations: ['Eligibility verification pending']
    };
  }
  result.checksPassed.push('Academic Eligibility verified');

  // 3. Absenteeism Exclusion Check
  if (student.absent_drives_penalty && student.absent_drives_penalty > 0) {
    if (!options.hasApprovedException) {
      return {
        status: 'BLOCKED',
        code: 'ABSENTEEISM_PENALTY_ACTIVE',
        policyClause: 'Section 3.2: Attendance and Absenteeism Policy',
        reason: `Student is flagged for unexcused recruitment absenteeism and currently excluded from the next ${student.absent_drives_penalty} drive(s). Submit an emergency exception for review by Placement Cell.`,
        violations: [`Active absenteeism penalty (${student.absent_drives_penalty} drives remaining)`]
      };
    } else {
      result.checksPassed.push('Emergency exception approved for absenteeism penalty override');
    }
  } else {
    result.checksPassed.push('No active absenteeism disciplinary exclusion');
  }

  // 4. Target Drive / Offer Parameters
  const targetCategory = driveOrOffer.category || determineCategory(driveOrOffer.ctc_lpa);
  const targetOfferType = driveOrOffer.offer_type; // 'I', 'F', 'I+F'
  const targetCtc = parseFloat(driveOrOffer.ctc_lpa) || 0;
  const targetStipend = parseFloat(driveOrOffer.stipend_amount) || 0;

  // 5. Course Compatibility Check
  if (driveOrOffer.eligible_courses) {
    let eligibleList = [];
    try {
      eligibleList = Array.isArray(driveOrOffer.eligible_courses)
        ? driveOrOffer.eligible_courses
        : JSON.parse(driveOrOffer.eligible_courses);
    } catch {
      eligibleList = String(driveOrOffer.eligible_courses).split(',').map(s => s.trim());
    }

    if (eligibleList.length > 0 && !eligibleList.includes(student.course)) {
      return {
        status: 'BLOCKED',
        code: 'COURSE_NOT_ELIGIBLE',
        policyClause: 'Section 2 & 3.2: Programme-Specific Criteria',
        reason: `Drive is restricted to [${eligibleList.join(', ')}]. Student is enrolled in '${student.course}'.`,
        violations: [`Programme mismatch: ${student.course} not in eligible list`]
      };
    }
    result.checksPassed.push(`Programme matches eligible list (${student.course})`);
  }

  // 6. Minimum CGPA Check
  if (driveOrOffer.min_cgpa && (student.cgpa || 0) < driveOrOffer.min_cgpa) {
    return {
      status: 'BLOCKED',
      code: 'CGPA_CRITERIA_NOT_MET',
      policyClause: 'Section 3.2: Company-Specific Academic Criteria',
      reason: `Company requires minimum CGPA of ${driveOrOffer.min_cgpa}. Student CGPA is ${student.cgpa || 'N/A'}.`,
      violations: [`CGPA ${student.cgpa || 0} is below requirement of ${driveOrOffer.min_cgpa}`]
    };
  }
  if (driveOrOffer.min_cgpa) {
    result.checksPassed.push(`CGPA criteria satisfied (${student.cgpa} >= ${driveOrOffer.min_cgpa})`);
  }

  // 7. If student is currently Unplaced, they are immediately eligible!
  if (!student.placement_status || student.placement_status === 'Unplaced' || !student.current_company) {
    result.details = {
      isUnplaced: true,
      currentCategory: 'None',
      targetCategory,
      targetOfferType
    };
    return result;
  }

  // 8. Policy Evaluation for Placed / Holding Students
  const currentCategory = student.current_category || determineCategory(student.current_ctc);
  const currentOfferType = student.current_offer_type; // 'I', 'F', 'I+F'
  const currentCtc = parseFloat(student.current_ctc) || 0;

  result.details = {
    currentCompany: student.current_company,
    currentCategory,
    currentOfferType,
    currentCtc,
    targetCategory,
    targetOfferType,
    targetCtc
  };

  // -------------------------------------------------------------
  // Rule A: Internship + PPO/FTE (I+F) Lock
  // "After selection, the student cannot participate in other I, F, or I+F roles at another organization."
  // -------------------------------------------------------------
  if (currentOfferType === 'I+F' || student.placement_status === 'Internship + PPO/FTE') {
    return {
      status: 'BLOCKED',
      code: 'IF_OFFER_LOCKED',
      policyClause: 'Section 3.2 Clause 3: Internship + PPO/FTE (I+F) Restriction',
      reason: `Student is already placed in an Internship + PPO/FTE (I+F) role at ${student.current_company}. Under NFSU Policy, students holding I+F are completely barred from participating in other roles at any organization.`,
      violations: ['I+F offer holder lock applied']
    };
  }

  // -------------------------------------------------------------
  // Rule B: Company Category A+ Lock
  // "A+ (>= ₹16 LPA): No switching policy; students selected in A+ are out of the placement process."
  // -------------------------------------------------------------
  if (currentCategory === 'A+') {
    return {
      status: 'BLOCKED',
      code: 'APLUS_SWITCHING_PROHIBITED',
      policyClause: 'Section 3.2 Category A+ Switching Rule',
      reason: `Student holds an A+ category offer (>= ₹16 LPA) at ${student.current_company} (₹${currentCtc} LPA). The policy strictly mandates: "No switching policy; students selected in A+ are out of the placement process."`,
      violations: ['A+ tier placement reached; placement process complete']
    };
  }

  // -------------------------------------------------------------
  // Rule C: Offer-Type Specific Restrictions
  // - Internship only (I): Cannot apply for another internship-only role, but may apply for FTE or I+F.
  // - FTE only (F): Cannot apply for another FTE-only role, but may apply for an internship role.
  // -------------------------------------------------------------
  if (currentOfferType === 'I' && targetOfferType === 'I') {
    return {
      status: 'BLOCKED',
      code: 'INTERNSHIP_DUPLICATE_RESTRICTION',
      policyClause: 'Section 3.2 Offer-Type Rule: Internship Only (I)',
      reason: `Student already holds an Internship-only offer at ${student.current_company}. Policy prohibits applying for another Internship-only role. Student may only apply for FTE (F) or Internship+FTE (I+F) roles.`,
      violations: ['Duplicate Internship-only (I -> I) application prohibited']
    };
  }

  if (currentOfferType === 'F' && targetOfferType === 'F') {
    // If student already has FTE-only offer, they cannot apply for another FTE-only role unless switching rules permit
    // Wait! Let's re-read the exact wording from the problem statement:
    // "FTE only (F): After selection for FTE, the student cannot apply for another FTE-only role, but may apply for an internship role, subject to other policy rules."
    // Let's also check switching rule: Does category switching allow upgrading FTE or does FTE-only clause block another FTE?
    // In NFSU guidelines:
    // If current is FTE and target is FTE, Clause says "cannot apply for another FTE-only role, but may apply for an internship role, subject to other policy rules."
    // However, what if they qualify under category switching (e.g. from B to A+, or B 1.5x)?
    // The policy explicitly says:
    // "FTE only (F): After selection for FTE, the student cannot apply for another FTE-only role, but may apply for an internship role, subject to other policy rules."
    // Therefore, an FTE-only holder applying for FTE-only is blocked by this offer-type constraint!
    return {
      status: 'BLOCKED',
      code: 'FTE_DUPLICATE_RESTRICTION',
      policyClause: 'Section 3.2 Offer-Type Rule: FTE Only (F)',
      reason: `Student already holds an FTE-only offer at ${student.current_company}. Under Section 3.2 Offer-type restrictions: "After selection for FTE, the student cannot apply for another FTE-only role, but may apply for an internship role, subject to other policy rules."`,
      violations: ['FTE-only holder cannot apply for another FTE-only role']
    };
  }

  // -------------------------------------------------------------
  // Rule D: Category-Based Compensation Switching Rules
  // -------------------------------------------------------------

  // Category A: (10–16 LPA) -> Switching allowed ONLY to A+ category companies (>= 16 LPA)
  if (currentCategory === 'A') {
    if (targetCategory === 'A+') {
      result.checksPassed.push(`Category A to A+ upgrade permitted (${currentCategory} -> ${targetCategory})`);
      result.reason = `Switching allowed: Student holds Category A offer at ₹${currentCtc} LPA and target company offers Category A+ (₹${targetCtc} LPA, >= ₹${currentConfig.categoryThresholds.A_PLUS} LPA).`;
      return result;
    } else {
      return {
        status: 'BLOCKED',
        code: 'CATEGORY_A_RESTRICTION',
        policyClause: 'Section 3.2 Category A Switching Policy',
        reason: `Student holds Category A offer at ${student.current_company} (₹${currentCtc} LPA). Switching is permitted ONLY to A+ category companies (>= ₹${currentConfig.categoryThresholds.A_PLUS} LPA). Target company is in Category '${targetCategory}' (₹${targetCtc} LPA).`,
        violations: [`Target category ${targetCategory} is below A+ requirement`]
      };
    }
  }

  // Category B: (6–10 LPA) -> Further placement allowed where new package is at least 1.5 times existing package
  if (currentCategory === 'B') {
    const requiredCtc = Math.round((currentCtc * currentConfig.switchingMultipliers.B_TO_NEW) * 100) / 100;
    if (targetCtc >= requiredCtc) {
      result.checksPassed.push(`Category B 1.5x package multiplier satisfied (Target ₹${targetCtc} LPA >= Required ₹${requiredCtc} LPA)`);
      result.reason = `Switching allowed: Target package of ₹${targetCtc} LPA satisfies the 1.5x switching rule over existing ₹${currentCtc} LPA (minimum requirement: ₹${requiredCtc} LPA).`;
      return result;
    } else {
      return {
        status: 'BLOCKED',
        code: 'CATEGORY_B_MULTIPLIER_UNMET',
        policyClause: 'Section 3.2 Category B 1.5x Multiplier Rule',
        reason: `Student holds Category B offer at ${student.current_company} (₹${currentCtc} LPA). Switching requires new package to be at least 1.5x the existing package (₹${requiredCtc} LPA minimum). Target offer is ₹${targetCtc} LPA.`,
        violations: [`New CTC ₹${targetCtc} LPA is below 1.5x threshold (₹${requiredCtc} LPA)`]
      };
    }
  }

  // Category C: (Below 6 LPA) -> Eligible for higher-category opportunities (B, A, A+)
  if (currentCategory === 'C') {
    if (targetCategory === 'B' || targetCategory === 'A' || targetCategory === 'A+') {
      result.checksPassed.push(`Category C upgrade to higher category ${targetCategory} permitted`);
      result.reason = `Switching allowed: Student currently in Category C (₹${currentCtc} LPA) is eligible for higher-category opportunity in Category ${targetCategory} (₹${targetCtc} LPA).`;
      return result;
    } else {
      // Trying to switch from C to another C
      return {
        status: 'BLOCKED',
        code: 'CATEGORY_C_LATERAL_BLOCKED',
        policyClause: 'Section 3.2 Category C Opportunity Policy',
        reason: `Student already holds a Category C offer at ${student.current_company}. Under Section 3.2, students in Category C are eligible for higher-category opportunities (B, A, or A+). Lateral switching to another Category C offer is not permitted.`,
        violations: ['Lateral Category C to Category C switch not permitted']
      };
    }
  }

  return result;
}

/**
 * Computes institutional Student ID blocking status based on placement policy rules:
 * - Deregistration from campus placements
 * - Incomplete placement registration
 * - Academic ineligibility or pending coordinator verification
 * - Clause 3.2 Absenteeism penalty (3 drives ban)
 * - Category A+ offer lock (>= 16 LPA out of placement process)
 * - Internship + FTE (I+F) dual offer lock
 */
function computeIdBlockStatus(student) {
  if (!student) {
    return {
      isBlocked: false,
      badge: 'ACTIVE_ELIGIBLE',
      label: '✅ Active & Eligible',
      reason: 'Student profile verified and active in placement process.'
    };
  }

  if (student.registration_status === 'Deregistered') {
    return {
      isBlocked: true,
      badge: 'BLOCKED_DEREGISTERED',
      label: '🚫 Blocked (Deregistered)',
      reason: 'Student deregistered from campus placements under NFSU Policy.'
    };
  }

  if (student.registration_status === 'Not registered') {
    return {
      isBlocked: true,
      badge: 'BLOCKED_NOT_REGISTERED',
      label: '🚫 Blocked (Not Registered)',
      reason: 'Placement registration incomplete. Access to recruitment drives restricted.'
    };
  }

  if (student.eligibility_status === 'Ineligible') {
    return {
      isBlocked: true,
      badge: 'BLOCKED_INELIGIBLE',
      label: '🚫 Blocked (Academic Ineligible)',
      reason: 'Academic eligibility criteria not met (CGPA or academic backlogs).'
    };
  }

  if (student.eligibility_status === 'Pending verification') {
    return {
      isBlocked: true,
      badge: 'BLOCKED_PENDING',
      label: '⚠️ Blocked (Verification Pending)',
      reason: 'Department coordinator verification pending.'
    };
  }

  if (student.absent_drives_penalty && student.absent_drives_penalty > 0) {
    return {
      isBlocked: true,
      badge: 'BLOCKED_ABSENTEEISM',
      label: `🚫 Blocked (${student.absent_drives_penalty} Drives Ban)`,
      reason: `Absenteeism disciplinary penalty active under NFSU Clause 3.2.`
    };
  }

  if (student.current_category === 'A+') {
    return {
      isBlocked: true,
      badge: 'LOCKED_APLUS',
      label: '🔒 Locked (Category A+ Placed)',
      reason: 'Selected in Category A+ (>= 16 LPA). Out of placement process under Clause 3.2.'
    };
  }

  if (student.current_offer_type === 'I+F' || student.placement_status === 'Internship + PPO/FTE') {
    return {
      isBlocked: true,
      badge: 'LOCKED_IF',
      label: '🔒 Locked (I+F Placed)',
      reason: 'Holding dual Internship + FTE offer. Barred from further drives.'
    };
  }

  return {
    isBlocked: false,
    badge: 'ACTIVE_ELIGIBLE',
    label: '✅ Active & Eligible',
    reason: 'Eligible for matching recruitment drives.'
  };
}

module.exports = {
  determineCategory,
  evaluateEligibility,
  computeIdBlockStatus,
  getPolicyConfig,
  updatePolicyConfig,
  DEFAULT_POLICY_CONFIG
};

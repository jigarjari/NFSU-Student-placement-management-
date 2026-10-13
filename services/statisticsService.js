const { db } = require('../db/database');
const { evaluateEligibility } = require('./policyEngine');

function calculateMedian(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateAverage(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return Math.round((sum / numbers.length) * 100) / 100;
}

function getSystemStatistics(courseFilter = null) {
  let studentQuery = 'SELECT * FROM students WHERE is_archived = 0';
  const params = [];
  if (courseFilter) {
    studentQuery += ' AND course = ?';
    params.push(courseFilter);
  }

  const allStudents = db.prepare(studentQuery).all(...params);

  // Totals
  const totalStudents = allStudents.length;
  const totalRegistered = allStudents.filter(s => s.registration_status === 'Registered').length;
  const totalDeregistered = allStudents.filter(s => s.registration_status === 'Deregistered').length;
  const totalNotRegistered = allStudents.filter(s => s.registration_status === 'Not registered').length;

  const totalEligible = allStudents.filter(s => s.eligibility_status === 'Eligible').length;
  const totalIneligible = allStudents.filter(s => s.eligibility_status === 'Ineligible').length;
  const totalPendingVerification = allStudents.filter(s => s.eligibility_status === 'Pending verification').length;

  const placedStudents = allStudents.filter(s => s.placement_status !== 'Unplaced' && s.current_company);
  const uniquePlacedCount = placedStudents.length;
  const unplacedCount = totalStudents - uniquePlacedCount;

  // Counts by Offer Type
  const internshipOnlyCount = allStudents.filter(s => s.placement_status === 'Internship only').length;
  const fteOnlyCount = allStudents.filter(s => s.placement_status === 'FTE only').length;
  const internshipPlusPpoCount = allStudents.filter(s => s.placement_status === 'Internship + PPO/FTE').length;

  // Counts by Offer Category
  const categoryAPlusCount = placedStudents.filter(s => s.current_category === 'A+').length;
  const categoryACount = placedStudents.filter(s => s.current_category === 'A').length;
  const categoryBCount = placedStudents.filter(s => s.current_category === 'B').length;
  const categoryCCount = placedStudents.filter(s => s.current_category === 'C').length;

  // Compensation arrays (Separating FTE CTC from Internship Stipends!)
  const ftePackages = placedStudents
    .filter(s => s.current_ctc && s.current_ctc > 0)
    .map(s => Number(s.current_ctc));

  const internshipStipends = placedStudents
    .filter(s => s.current_stipend && s.current_stipend > 0)
    .map(s => Number(s.current_stipend));

  const highestFteCtc = ftePackages.length > 0 ? Math.max(...ftePackages) : 0;
  const averageFteCtc = calculateAverage(ftePackages);
  const medianFteCtc = calculateMedian(ftePackages);

  const highestStipend = internshipStipends.length > 0 ? Math.max(...internshipStipends) : 0;
  const averageStipend = calculateAverage(internshipStipends);
  const medianStipend = calculateMedian(internshipStipends);

  // Total Offers recorded across all student history
  let offersQuery = `
    SELECT o.*, s.course FROM offers o
    JOIN students s ON o.student_id = s.id
    WHERE s.is_archived = 0
  `;
  const offerParams = [];
  if (courseFilter) {
    offersQuery += ' AND s.course = ?';
    offerParams.push(courseFilter);
  }
  const allOffers = db.prepare(offersQuery).all(...offerParams);
  const totalOffersReceived = allOffers.length;

  // Pending Actions
  const pendingOfferAcceptance = allStudents.filter(s => s.offer_acceptance === 'Pending' && s.current_company).length;
  const pendingJoining = allStudents.filter(s => s.joining_status === 'Pending' && s.placement_status !== 'Unplaced').length;
  const activeAbsenteeismPenalties = allStudents.filter(s => s.absent_drives_penalty > 0).length;
  const pendingExceptions = db.prepare("SELECT count(*) as count FROM policy_exceptions WHERE status = 'Pending'").get().count;

  // Course-Wise Breakdown (Always compute all 5 courses)
  const coursesList = [
    'M.Tech. CS',
    'M.Tech. AIDS',
    'B.Tech.-M.Tech. CS',
    'M.Sc. CS',
    'M.Sc. DFIS'
  ];

  const courseBreakdown = coursesList.map(cName => {
    const cStudents = allStudents.filter(s => s.course === cName);
    const cTotal = cStudents.length;
    const cPlaced = cStudents.filter(s => s.placement_status !== 'Unplaced' && s.current_company).length;
    const cFtePackages = cStudents.filter(s => s.current_ctc > 0).map(s => Number(s.current_ctc));
    const cStipends = cStudents.filter(s => s.current_stipend > 0).map(s => Number(s.current_stipend));

    return {
      course: cName,
      totalStudents: cTotal,
      placedCount: cPlaced,
      unplacedCount: cTotal - cPlaced,
      placementRate: cTotal > 0 ? Math.round((cPlaced / cTotal) * 100) : 0,
      internshipOnly: cStudents.filter(s => s.placement_status === 'Internship only').length,
      fteOnly: cStudents.filter(s => s.placement_status === 'FTE only').length,
      internshipPlusPpo: cStudents.filter(s => s.placement_status === 'Internship + PPO/FTE').length,
      highestCtc: cFtePackages.length > 0 ? Math.max(...cFtePackages) : 0,
      averageCtc: calculateAverage(cFtePackages),
      medianCtc: calculateMedian(cFtePackages),
      averageStipend: calculateAverage(cStipends)
    };
  });

  // Company-Wise Breakdown
  const companyMap = {};
  allOffers.forEach(o => {
    if (!companyMap[o.company_name]) {
      companyMap[o.company_name] = {
        company: o.company_name,
        category: o.category,
        offerType: o.offer_type,
        totalOffers: 0,
        ctcLpa: o.ctc_lpa || 0,
        stipend: o.stipend_amount || 0,
        acceptedOffers: 0
      };
    }
    companyMap[o.company_name].totalOffers++;
    if (o.offer_status === 'Accepted') {
      companyMap[o.company_name].acceptedOffers++;
    }
  });
  const companyBreakdown = Object.values(companyMap);

  // Students Eligible for Subsequent Drives under Switching Rules
  const switchingEligibleStudents = allStudents.filter(s => {
    if (s.registration_status !== 'Registered' || s.eligibility_status !== 'Eligible') return false;
    if (s.absent_drives_penalty > 0) return false;
    if (s.placement_status === 'Unplaced') return true; // Unplaced students are eligible for all matching drives
    // If placed, can they switch?
    if (s.current_category === 'A+') return false; // A+ locked
    if (s.current_offer_type === 'I+F') return false; // I+F locked
    if (s.current_category === 'A') return true; // Can switch to A+
    if (s.current_category === 'B') return true; // Can switch to >= 1.5x
    if (s.current_category === 'C') return true; // Can switch to B, A, A+
    return false;
  }).map(s => ({
    placementId: s.placement_id,
    name: s.student_name,
    course: s.course,
    currentPlacement: s.current_company || 'Unplaced',
    currentCategory: s.current_category || 'N/A',
    currentCtc: s.current_ctc || 0,
    switchingRuleAllowed: s.placement_status === 'Unplaced'
      ? 'All matching drives'
      : s.current_category === 'A'
        ? 'A+ category only (>= 16 LPA)'
        : s.current_category === 'B'
          ? `Offers >= ₹${Math.round(s.current_ctc * 1.5 * 100) / 100} LPA (1.5x rule)`
          : 'Higher category drives (B, A, A+)'
  }));

  return {
    overview: {
      totalStudents,
      totalRegistered,
      totalDeregistered,
      totalNotRegistered,
      totalEligible,
      totalIneligible,
      totalPendingVerification,
      uniquePlacedCount,
      unplacedCount,
      totalOffersReceived,
      placementRate: totalRegistered > 0 ? Math.round((uniquePlacedCount / totalRegistered) * 100) : 0
    },
    offerTypes: {
      internshipOnlyCount,
      fteOnlyCount,
      internshipPlusPpoCount
    },
    categories: {
      categoryAPlusCount,
      categoryACount,
      categoryBCount,
      categoryCCount
    },
    compensation: {
      highestFteCtc,
      averageFteCtc,
      medianFteCtc,
      highestStipend,
      averageStipend,
      medianStipend
    },
    pendingCases: {
      pendingOfferAcceptance,
      pendingJoining,
      activeAbsenteeismPenalties,
      pendingExceptions
    },
    courseBreakdown,
    companyBreakdown,
    switchingEligibleCount: switchingEligibleStudents.length,
    switchingEligibleStudents: switchingEligibleStudents.slice(0, 50)
  };
}

module.exports = {
  calculateMedian,
  calculateAverage,
  getSystemStatistics
};

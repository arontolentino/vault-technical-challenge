const fs = require('fs');
const readline = require('readline');
const moment = require('moment');
const currency = require('currency.js');

// Global variabes
const input = [];
const successfulAttempts = [];

/**
 * @desc Creates response for a fund attempt that failed
 * @param {Object} attempt - load fund attempt
 * @returns {string} Result for a failed load attempt
 */
const decline = (attempt) => {
  return JSON.stringify({
    id: attempt.id,
    customer_id: attempt.customer_id,
    accepted: false,
  });
};

/**
 * @desc Creates response for a fund attempt that failed
 * @param {Object} attempt - Load fund attempt
 * @returns {string} Result for a successful load attempt
 */
const accept = (attempt) => {
  successfulAttempts.push(attempt);

  return JSON.stringify({
    id: attempt.id,
    customer_id: attempt.customer_id,
    accepted: true,
  });
};

/**
 * @desc Parses currency ammount to the smallest cent value while avoiding common floating point errors
 * @param {string} amount - Load amount
 * @returns {number} Value with optimal decimal precision for currency calculation
 */
const parseCurrency = (amount) => currency(amount).value;

/**
 * @desc Calculate the sum of all load attempt values in an array
 * @param {Object[]} attempt - array of load attempts
 * @returns {number} Sum of all load attempt values
 */
const sumLoadAmount = (attempts) => {
  if (!attempts) {
    return null;
  } else if (attempts.length === 1) {
    return parseCurrency(attempts[0].load_amount);
  } else {
    return parseCurrency(
      attempts.reduce(
        (previous, current) => previous + parseCurrency(current.load_amount),
        0
      )
    );
  }
};

/**
 * @desc Checks if a previous load attempt duplicate exists
 * @param {Object} newAttempt - Load attempt object
 * @returns {boolean} Sum of load attempt values
 */
const findExisting = (newAttempt) => {
  return input.some(
    (attempt) =>
      attempt.id === newAttempt.id &&
      attempt.customer_id === newAttempt.customer_id &&
      moment.utc(attempt.time).isBefore(newAttempt.time)
  );
};

/**
 * @desc Finds all load attempts from a single customer made on the same day as the new load attempt
 * @param {Object} newAttempt - Load attempt object
 * @returns {Object[]} Array of load attempts
 */
const findDailyAttempts = (newAttempt) => {
  return successfulAttempts.filter(
    (attempt) =>
      attempt.customer_id === newAttempt.customer_id &&
      moment.utc(attempt.time).isSame(newAttempt.time, 'day')
  );
};

/**
 * @desc Finds all load attempts from a single customer made on the same week as the new load attempt
 * @param {Object} newAttempt - Load attempt object
 * @returns {Object[]} Array of load attempts
 */
const findWeeklyAttempts = (newAttempt) => {
  const startOfWeek = moment.utc(newAttempt.time).startOf('week');
  const endOfWeek = moment.utc(newAttempt.time).endOf('week');

  return successfulAttempts.filter(
    (attempt) =>
      attempt.customer_id === newAttempt.customer_id &&
      moment.utc(attempt.time).isBetween(startOfWeek, endOfWeek)
  );
};

/**
 * @desc Processes load attempts from input.txt based on velocity limits and output results to output.txt
 */
const loadFunds = async () => {
  try {
    console.log('Parsing "input.txt".');

    // Read input.txt file
    const fileStream = fs.createReadStream('input.txt');

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      input.push(JSON.parse(line));
    }

    console.log('Processing load attempts.');

    const results = input.flatMap((attempt) => {
      // 1. Check if an earlier attempt with the same id anc customer_id exists
      const existingAttempt = findExisting(attempt);

      if (existingAttempt) {
        return [];
      }

      // 2. Check if attempt load amount exceeds $5000
      const loadAmount = parseCurrency(attempt.load_amount);

      if (loadAmount > 5000) {
        return decline(attempt);
      }

      // 3. Check if daily attempts have exceeded 3 attempts
      const dailyAttempts = findDailyAttempts(attempt);

      if (dailyAttempts.length > 3) {
        return decline(attempt);
      }

      // 4. Check if daily attempt sum in addition to the new attempt exceeds $5000
      const dailySum = sumLoadAmount(dailyAttempts);

      if (dailySum + loadAmount > 5000) {
        return decline(attempt);
      }

      // 5. Check if weekly attempt sum in addition to the new attempt exceeds $2000
      const weeklyAttempts = findWeeklyAttempts(attempt);
      const weeklySum = sumLoadAmount(weeklyAttempts);

      if (weeklySum + loadAmount > 20000) {
        return decline(attempt);
      }

      // If new attempt passes all 5 conditions above, accept the attempt
      return [accept(attempt)];
    });

    // Separate the results array and generate an output.txt file in the directory
    fs.writeFileSync('output.txt', results.join('\n'), 'utf8');

    console.log(
      'Successfully processed load attempts. Please check "output.txt" for the results.'
    );
  } catch (error) {
    console.log(error);
  }
};

loadFunds();

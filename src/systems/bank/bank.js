/**
 * Bank Economy System
 * Persistent storage using JSON file for user balances (per guild)
 */

import fs from 'fs';
import path from 'path';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';
import { DATA_DIR } from '../../config/constants.js';

// Currency symbol
export const CURRENCY = '💰';

const getBankFile = (guildId) => path.join(DATA_DIR, `bank-data-${guildId}.json`);

/**
 * Load bank data from file for a guild
 * @param {string} guildId
 * @returns {Map} userId -> balance
 */
function loadData(guildId) {
  const file = getBankFile(guildId);
  try {
    if (fs.existsSync(file)) {
      const rawData = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(rawData);
      return new Map(Object.entries(data));
    }
  } catch (error) {
    console.error(`❌ Error loading bank data for guild ${guildId}:`, error);
  }
  return new Map();
}

/**
 * Save bank data to file for a guild
 * @param {string} guildId
 * @param {Map} bankData
 */
function saveData(guildId, bankData) {
  const file = getBankFile(guildId);
  try {
    const data = Object.fromEntries(bankData);
    writeJsonAtomicSync(file, data);
  } catch (error) {
    console.error(`❌ Error saving bank data for guild ${guildId}:`, error);
  }
}

/**
 * Get user balance
 * @param {string} guildId
 * @param {string} userId
 * @returns {number}
 */
export function getBalance(guildId, userId) {
  const bankData = loadData(guildId);
  return Number(bankData.get(userId)) || 0;
}

/**
 * Deposit money to user account
 * @param {string} guildId
 * @param {string} userId
 * @param {number} amount
 * @returns {object}
 */
export function deposit(guildId, userId, amount) {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  const bankData = loadData(guildId);
  const currentBalance = Number(bankData.get(userId)) || 0;
  const newBalance = currentBalance + amount;
  bankData.set(userId, newBalance);
  saveData(guildId, bankData);
  return {
    success: true,
    newBalance,
    deposited: amount
  };
}

/**
 * Withdraw money from user account
 * @param {string} guildId
 * @param {string} userId
 * @param {number} amount
 * @returns {object}
 */
export function withdraw(guildId, userId, amount) {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }
  const bankData = loadData(guildId);
  const currentBalance = Number(bankData.get(userId)) || 0;
  if (currentBalance < amount) {
    return {
      success: false,
      error: `Insufficient funds. Balance: ${CURRENCY}${currentBalance}`
    };
  }
  const newBalance = currentBalance - amount;
  if (newBalance === 0) {
    bankData.delete(userId);
  } else {
    bankData.set(userId, newBalance);
  }
  saveData(guildId, bankData);
  return {
    success: true,
    newBalance,
    withdrawn: amount
  };
}

/**
 * Get all users with non-zero balance for a guild
 * @param {string} guildId
 * @returns {Array} Array of [userId, balance] pairs
 */
export function getActiveUsers(guildId) {
  const bankData = loadData(guildId);
  return Array.from(bankData.entries()).filter(([_, balance]) => Number(balance) > 0);
}

/**
 * Clear a specific user's balance
 * @param {string} guildId
 * @param {string} userId
 * @returns {object}
 */
export function clearUser(guildId, userId) {
  const bankData = loadData(guildId);
  const currentBalance = Number(bankData.get(userId)) || 0;
  if (currentBalance === 0) {
    return {
      success: false,
      error: 'User has no balance to clear'
    };
  }
  bankData.delete(userId);
  saveData(guildId, bankData);
  return {
    success: true,
    clearedAmount: currentBalance
  };
}

/**
 * Clear all users' balances for a guild
 * @param {string} guildId
 * @returns {object}
 */
export function clearAll(guildId) {
  const bankData = loadData(guildId);
  const userCount = bankData.size;
  if (userCount === 0) {
    return {
      success: false,
      error: 'No users in the bank to clear'
    };
  }
  bankData.clear();
  saveData(guildId, bankData);
  return {
    success: true,
    clearedUsers: userCount
  };
}

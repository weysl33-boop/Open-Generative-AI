import 'server-only';

import * as usersRepo from '../repositories/users.js';

export async function getProfile(userId) {
  return usersRepo.getUserProfile(userId);
}

export async function updateProfile(userId, fields) {
  return usersRepo.updateUserProfile(userId, fields);
}

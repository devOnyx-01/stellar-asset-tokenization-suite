//! Soroban v22-style authorization: callers pass `auth: Address` and prove control with `require_auth`.

use soroban_sdk::Address;

#[inline(always)]
pub fn assert_admin(auth: &Address, admin: &Address) {
    auth.require_auth();
    if auth != admin {
        panic!("Unauthorized");
    }
}

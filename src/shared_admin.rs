use soroban_sdk::{Address, Env, Symbol, panic_with_error, contracterror};
use crate::auth::assert_admin;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AdminError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
}

pub fn write_admin(env: &Env, auth: &Address, admin: &Address) {
    auth.require_auth();
    let admin_key = Symbol::new(env, "admin");
    if env.storage().instance().has(&admin_key) {
        panic_with_error!(env, AdminError::AlreadyInitialized);
    }
    env.storage().instance().set(&admin_key, admin);
}

pub fn require_admin(env: &Env, auth: &Address) {
    let admin_key = Symbol::new(env, "admin");
    let admin: Address = match env.storage().instance().get(&admin_key) {
        Some(admin) => admin,
        None => panic_with_error!(env, AdminError::NotInitialized),
    };
    assert_admin(auth, &admin);
}

function upgradeKolAccounts(db){
 // The compatibility column always mirrors the first linked account. Re-running
 // this migration cannot resurrect an account removed through the CRM API.
 db.exec('INSERT OR IGNORE INTO crm_kol_accounts(kol_id,owner_id,account_id,position,created_at) SELECT id,owner_id,account_id,0,created_at FROM crm_kols WHERE account_id IS NOT NULL')
}
module.exports={upgradeKolAccounts}

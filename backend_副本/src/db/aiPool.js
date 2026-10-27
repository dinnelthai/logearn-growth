// AI workflow data needs standard PostgreSQL transactions and constraints.
// Keep it separate from Hologres when AI_DATABASE_URL is provided.
const {Pool}=require('pg');
module.exports=process.env.AI_DATABASE_URL
  ? new Pool({connectionString:process.env.AI_DATABASE_URL,max:5,connectionTimeoutMillis:5000,statement_timeout:30000})
  : require('./readWritePool').getWritePool();
module.exports.on('error',error=>console.error('[AI database]',error.message));

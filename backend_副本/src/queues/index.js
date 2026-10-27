/**
 * 队列模块统一导出
 */

module.exports = {
  ...require('./queues'),
  aiAnalysisJobs: require('./jobs/aiAnalysis')
};

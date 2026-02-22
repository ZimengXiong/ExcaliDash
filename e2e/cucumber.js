module.exports = {
  default: {
    require: ["features/**/*.ts"],
    paths: ["features/**/*.feature"],
    tags: process.env.CUCUMBER_TAGS,
    format: ["progress-bar", "html:reports/cucumber-report.html", "json:reports/cucumber-report.json"],
    requireModule: ["ts-node/register"],
    worldParameters: {
      baseUrl: process.env.BASE_URL || "http://127.0.0.1:5173",
      apiUrl: process.env.API_URL || "http://127.0.0.1:8000",
    },
  },
};

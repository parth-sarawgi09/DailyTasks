const { createApp } = require("./app");

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`Fitness progress API listening on port ${port}`);
});

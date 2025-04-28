const mongoose = require("mongoose");
const mongoURI = process.env.MONGODB_URI;

const initializeDB = async () => {
  try {
    const connect = await mongoose.connect(mongoURI);
    if (connect) {
      console.log("DB connected successfully.");
    }
  } catch (error) {
    console.log("Failed to connect to the MongoDB server: ", error.message);
  }
};

module.exports = initializeDB;

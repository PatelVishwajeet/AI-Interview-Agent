import mongoose from "mongoose";

export const isDbConnected = () => mongoose.connection.readyState === 1;

const connectDb = async () => {
    if (!process.env.MONGODB_URL) {
        throw new Error("MONGODB_URL is missing from server/.env")
    }

    try {
        await mongoose.connect(process.env.MONGODB_URL, {
            serverSelectionTimeoutMS: 10000,
        })
        console.log("DataBase Connected")
    } catch (error) {
        throw new Error(`DataBase Error ${error.message}`)
    }
}

export default connectDb

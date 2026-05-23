import express from "express"
import dotenv from "dotenv"
import connectDb, { isDbConnected } from "./config/connectDb.js"
import cookieParser from "cookie-parser"
dotenv.config()
import cors from "cors"
import authRouter from "./routes/auth.route.js"
import userRouter from "./routes/user.route.js"
import interviewRouter from "./routes/interview.route.js"
import paymentRouter from "./routes/payment.route.js"

const app = express()
const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }
        return callback(new Error("Not allowed by CORS"))
    },
    credentials:true
}))

app.use(express.json())
app.use(cookieParser())

app.get("/api/health", (req, res) => {
    res.status(isDbConnected() ? 200 : 503).json({
        status: "ok",
        database: isDbConnected() ? "connected" : "disconnected",
    })
})

app.use("/api", (req, res, next) => {
    if (req.path === "/health" || isDbConnected()) {
        return next()
    }

    return res.status(503).json({ message: "Database is not connected yet. Please try again shortly." })
})

app.use("/api/auth" , authRouter)
app.use("/api/user", userRouter)
app.use("/api/interview" , interviewRouter)
app.use("/api/payment" , paymentRouter)

const PORT = process.env.PORT || 6000

app.listen(PORT , ()=>{
    console.log(`Server running on port ${PORT}`)
    connectDb().catch((error) => {
        console.error(error.message)
    })
})

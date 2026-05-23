import genToken from "../config/token.js"
import User from "../models/user.model.js"

const cookieOptions = () => {
    const isProduction = process.env.NODE_ENV === "production"

    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    }
}

export const googleAuth = async (req,res) => {
    try {
        const {name , email} = req.body
        if (!name || !email) {
            return res.status(400).json({ message: "Name and email are required" })
        }
        let user = await User.findOne({email})
        if(!user){
            user = await User.create({
                name , 
                email
            })
        }
        let token = await genToken(user._id)
        res.cookie("token" , token , cookieOptions())

        return res.status(200).json(user)



    } catch (error) {
        return res.status(500).json({message:`Google auth error ${error}`})
    }
    
}

export const logOut = async (req,res) => {
    try {
        const { maxAge, ...clearOptions } = cookieOptions()
        res.clearCookie("token", clearOptions)
        return res.status(200).json({message:"LogOut Successfully"})
    } catch (error) {
         return res.status(500).json({message:`Logout error ${error}`})
    }
    
}

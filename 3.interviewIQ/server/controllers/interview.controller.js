import fs from "fs"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { askAi } from "../services/openRouter.service.js";
import User from "../models/user.model.js";
import Interview from "../models/interview.model.js";

const removeUploadedFile = async (filepath) => {
  if (!filepath || !fs.existsSync(filepath)) return;
  await fs.promises.unlink(filepath);
};

const parseAiJson = (text) => {
  if (!text || typeof text !== "string") {
    throw new Error("AI response is empty.");
  }

  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(jsonText);
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("AI response did not contain valid JSON.");
    }

    return JSON.parse(jsonText.slice(start, end + 1));
  }
};

export const analyzeResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Resume required" });
    }
    const filepath = req.file.path

    let fileBuffer;
    try {
      fileBuffer = await fs.promises.readFile(filepath)
    } catch (error) {
      await removeUploadedFile(filepath);
      return res.status(400).json({ message: "Failed to read uploaded file." });
    }

    const uint8Array = new Uint8Array(fileBuffer)

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    } catch (error) {
      await removeUploadedFile(filepath);
      return res.status(400).json({ message: "Failed to parse PDF. Please upload a valid PDF file." });
    }

    let resumeText = "";

    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      const pageText = content.items.map(item => item.str).join(" ");
      resumeText += pageText + "\n";
    }


    resumeText = resumeText
      .replace(/\s+/g, " ")
      .trim();

    if (!resumeText) {
      await removeUploadedFile(filepath);
      return res.status(400).json({ message: "No text found in PDF. Please upload a text-based PDF." });
    }

    const messages = [
      {
        role: "system",
        content: `
Extract structured data from resume.

Return in this exact format:

Role: [role]
Experience: [experience]
Projects: [project1, project2]
Skills: [skill1, skill2]
`
      },
      {
        role: "user",
        content: resumeText
      }
    ];


    const aiResponse = await askAi(messages)

    let parsed = {};
    try {
      // Try to parse as JSON first
      parsed = parseAiJson(aiResponse);
    } catch (error) {
      // If not JSON, parse as text
      const lines = aiResponse.split('\n');
      for (const line of lines) {
        if (line.startsWith('Role:')) {
          parsed.role = line.replace('Role:', '').trim();
        } else if (line.startsWith('Experience:')) {
          parsed.experience = line.replace('Experience:', '').trim();
        } else if (line.startsWith('Projects:')) {
          const projectsStr = line.replace('Projects:', '').trim();
          try {
            parsed.projects = JSON.parse(projectsStr);
          } catch {
            parsed.projects = projectsStr.split(',').map(p => p.trim()).filter(p => p);
          }
        } else if (line.startsWith('Skills:')) {
          const skillsStr = line.replace('Skills:', '').trim();
          try {
            parsed.skills = JSON.parse(skillsStr);
          } catch {
            parsed.skills = skillsStr.split(',').map(s => s.trim()).filter(s => s);
          }
        }
      }
    }

    await removeUploadedFile(filepath)


    res.json({
      role: parsed.role,
      experience: parsed.experience,
      projects: parsed.projects,
      skills: parsed.skills,
      resumeText
    });

  } catch (error) {
    console.error(error);

    if (req.file && fs.existsSync(req.file.path)) {
      await removeUploadedFile(req.file.path);
    }

    return res.status(500).json({ message: error.message });
  }
};


export const generateQuestion = async (req, res) => {
  try {
    let { role, experience, mode, resumeText, projects, skills } = req.body

    role = role?.trim();
    experience = experience?.trim();
    mode = mode?.trim();

    if (!role || !experience || !mode) {
      return res.status(400).json({ message: "Role, Experience and Mode are required." })
    }

    const user = await User.findById(req.userId)

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    if (user.credits < 50) {
      return res.status(400).json({
        message: "Not enough credits. Minimum 50 required."
      });
    }

    const projectText = Array.isArray(projects) && projects.length
      ? projects.join(", ")
      : "None";

    const skillsText = Array.isArray(skills) && skills.length
      ? skills.join(", ")
      : "None";

    const safeResume = resumeText?.trim() || "None";

    const userPrompt = `
    Role:${role}
    Experience:${experience}
    InterviewMode:${mode}
    Projects:${projectText}
    Skills:${skillsText},
    Resume:${safeResume}
    `;

    if (!userPrompt.trim()) {
      return res.status(400).json({
        message: "Prompt content is empty."
      });
    }

    const normalizedRole = role || "candidate";
    const projectPhrase = projectText !== "None" ? `a project involving ${projectText}` : "a recent project";
    const skillPhrase = skillsText !== "None" ? `your skills with ${skillsText}` : "your relevant skills";

    const questionsArray = [];
    if (mode === "HR") {
      questionsArray.push(
        `Why did you choose to pursue a career as a ${normalizedRole} and what motivates you most in this role?`,
        `How do you handle feedback from managers or teammates when expectations change quickly?`,
        `Describe a time you worked under pressure and still delivered solid results successfully.`,
        `What do you do to stay motivated during long or difficult projects at work?`,
        `How do you balance collaboration and ownership when working with a team on a key task?`
      );
    } else {
      questionsArray.push(
        `Tell me about your experience working as a ${normalizedRole} and one technical challenge you overcame.`,
        `Describe ${projectPhrase} and how ${skillPhrase} helped you deliver it successfully.`,
        `How do you approach debugging or performance issues when code does not work as expected?`,
        `What tools or habits do you use to keep your knowledge current in this field?`,
        `If a teammate disagreed with your approach, how would you resolve it while keeping the project moving?`
      );
    }


    user.credits -= 50;
    await user.save();

    const interview = await Interview.create({
      userId: user._id,
      role,
      experience,
      mode,
      resumeText: safeResume,
      questions: questionsArray.map((q, index) => ({
        question: q,
        difficulty: ["easy", "easy", "medium", "medium", "hard"][index],
        timeLimit: [60, 60, 90, 90, 120][index],
      }))
    })

    res.json({
      interviewId: interview._id,
      creditsLeft: user.credits,
      userName: user.name,
      questions: interview.questions
    });
  } catch (error) {
    return res.status(500).json({message:`failed to create interview ${error}`})
  }
}


export const submitAnswer = async (req, res) => {
  try {
    const { interviewId, questionIndex, answer, timeTaken } = req.body

    const interview = await Interview.findById(interviewId)
    if (!interview) {
      return res.status(404).json({ message: "Interview not found" })
    }
    if (String(interview.userId) !== String(req.userId)) {
      return res.status(403).json({ message: "Unauthorized interview access" })
    }
    const question = interview.questions[questionIndex]
    if (!question) {
      return res.status(404).json({ message: "Question not found" })
    }

    // If no answer
    if (!answer) {
      question.score = 0;
      question.feedback = "You did not submit an answer.";
      question.answer = "";

      await interview.save();

      return res.json({
        feedback: question.feedback
      });
    }

    // If time exceeded
    if (timeTaken > question.timeLimit) {
      question.score = 0;
      question.feedback = "Time limit exceeded. Answer not evaluated.";
      question.answer = answer;

      await interview.save();

      return res.json({
        feedback: question.feedback
      });
    }


    const messages = [
      {
        role: "system",
        content: `
You are a professional human interviewer evaluating a candidate's answer in a real interview.

Evaluate naturally and fairly, like a real person would.

Score the answer in these areas (0 to 10):

1. Confidence – Does the answer sound clear, confident, and well-presented?
2. Communication – Is the language simple, clear, and easy to understand?
3. Correctness – Is the answer accurate, relevant, and complete?

Rules:
- Be realistic and unbiased.
- Do not give random high scores.
- If the answer is weak, score low.
- If the answer is strong and detailed, score high.
- Consider clarity, structure, and relevance.

Calculate:
finalScore = average of confidence, communication, and correctness (rounded to nearest whole number).

Feedback Rules:
- Write natural human feedback.
- 10 to 15 words only.
- Sound like real interview feedback.
- Can suggest improvement if needed.
- Do NOT repeat the question.
- Do NOT explain scoring.
- Keep tone professional and honest.

Return ONLY valid JSON in this format:

{
  "confidence": number,
  "communication": number,
  "correctness": number,
  "finalScore": number,
  "feedback": "short human feedback"
}
`
      }
      ,
      {
        role: "user",
        content: `
Question: ${question.question}
Answer: ${answer}
`
      }
    ];


    const aiResponse = await askAi(messages)


    const parsed = parseAiJson(aiResponse);

    question.answer = answer;
    question.confidence = parsed.confidence;
    question.communication = parsed.communication;
    question.correctness = parsed.correctness;
    question.score = parsed.finalScore;
    question.feedback = parsed.feedback;
    await interview.save();


    return res.status(200).json({feedback :parsed.feedback})
  } catch (error) {
    return res.status(500).json({message:`failed to submit answer ${error}`})

  }
}


export const finishInterview = async (req,res) => {
  try {
    const {interviewId} = req.body
    const interview = await Interview.findById(interviewId)
    if(!interview){
      return res.status(400).json({message:"failed to find Interview"})
    }
    if (String(interview.userId) !== String(req.userId)) {
      return res.status(403).json({ message: "Unauthorized interview access" })
    }

    const totalQuestions = interview.questions.length;

    let totalScore = 0;
    let totalConfidence = 0;
    let totalCommunication = 0;
    let totalCorrectness = 0;

    interview.questions.forEach((q) => {
      totalScore += q.score || 0;
      totalConfidence += q.confidence || 0;
      totalCommunication += q.communication || 0;
      totalCorrectness += q.correctness || 0;
    });

    const finalScore = totalQuestions
      ? totalScore / totalQuestions
      : 0;

    const avgConfidence = totalQuestions
      ? totalConfidence / totalQuestions
      : 0;

    const avgCommunication = totalQuestions
      ? totalCommunication / totalQuestions
      : 0;

    const avgCorrectness = totalQuestions
      ? totalCorrectness / totalQuestions
      : 0;

    interview.finalScore = finalScore;
    interview.status = "completed";

    await interview.save();

    return res.status(200).json({
       finalScore: Number(finalScore.toFixed(1)),
      confidence: Number(avgConfidence.toFixed(1)),
      communication: Number(avgCommunication.toFixed(1)),
      correctness: Number(avgCorrectness.toFixed(1)),
      questionWiseScore: interview.questions.map((q) => ({
        question: q.question,
        score: q.score || 0,
        feedback: q.feedback || "",
        confidence: q.confidence || 0,
        communication: q.communication || 0,
        correctness: q.correctness || 0,
      })),
    })
  } catch (error) {
    return res.status(500).json({message:`failed to finish Interview ${error}`})
  }
}


export const getMyInterviews = async (req,res) => {
  try {
    const interviews = await Interview.find({userId:req.userId})
    .sort({ createdAt: -1 })
    .select("role experience mode finalScore status createdAt");

    return res.status(200).json(interviews)

  } catch (error) {
     return res.status(500).json({message:`failed to find currentUser Interview ${error}`})
  }
}

export const getInterviewReport = async (req,res) => {
  try {
    const interview = await Interview.findById(req.params.id)

    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }
    if (String(interview.userId) !== String(req.userId)) {
      return res.status(403).json({ message: "Unauthorized interview access" })
    }


    const totalQuestions = interview.questions.length;

    let totalConfidence = 0;
    let totalCommunication = 0;
    let totalCorrectness = 0;

    interview.questions.forEach((q) => {
      totalConfidence += q.confidence || 0;
      totalCommunication += q.communication || 0;
      totalCorrectness += q.correctness || 0;
    });
    const avgConfidence = totalQuestions
      ? totalConfidence / totalQuestions
      : 0;

    const avgCommunication = totalQuestions
      ? totalCommunication / totalQuestions
      : 0;

    const avgCorrectness = totalQuestions
      ? totalCorrectness / totalQuestions
      : 0;

       return res.json({
      finalScore: interview.finalScore,
      confidence: Number(avgConfidence.toFixed(1)),
      communication: Number(avgCommunication.toFixed(1)),
      correctness: Number(avgCorrectness.toFixed(1)),
      questionWiseScore: interview.questions
    });

  } catch (error) {
    return res.status(500).json({message:`failed to find currentUser Interview report ${error}`})
  }
}





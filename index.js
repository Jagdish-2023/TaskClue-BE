require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cors());

const Project = require("./models/project.model");
const Tag = require("./models/tag.model");
const Task = require("./models/task.model");
const Team = require("./models/team.model");
const User = require("./models/user.model");
const initializeDB = require("./db/db.connect");
initializeDB();

const verifyJWT = (req, res, next) => {
  const userToken = req.headers["authorization"].split(" ")[1];

  if (!userToken) {
    return res
      .status(401)
      .json({ error: "userToken is required for authorization" });
  }

  try {
    const decodedToken = jwt.verify(userToken, JWT_SECRET);

    req.user = decodedToken;

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired userToken" });
  }
};

//GET CALL
app.get("/projects", verifyJWT, async (req, res) => {
  try {
    const allProjects = await Project.find();
    res.status(200).json(allProjects);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/teams", verifyJWT, async (req, res) => {
  try {
    const allTeams = await Team.find();
    res.status(200).json(allTeams);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/team/:teamId", verifyJWT, async (req, res) => {
  const teamId = req.params.teamId;
  try {
    if (!teamId) {
      return res.status(400).json({ error: "Team Id is required" });
    }
    const teamDetails = await Team.findById(teamId);
    if (!teamDetails) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.status(200).json(teamDetails);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/users", verifyJWT, async (req, res) => {
  try {
    const users = await User.find();
    const usersWithoutPassword = users.map((user) => ({
      id: user._id,
      name: user.name,
    }));
    res.status(200).json(usersWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/tasks", verifyJWT, async (req, res) => {
  const queryParams = req.query;
  const { project, tag } = queryParams;

  try {
    if (!queryParams.project) {
      const tasks = await Task.find()
        .populate("owners", "_id name")
        .populate("project", "_id name description");
      return res.status(200).json(tasks);
    }

    if (tag) {
      const tasks = await Task.find({ project })
        .populate("owners", "_id name")
        .populate("project", "_id name description");

      const filteredTasks = tasks.filter((task) => task.tags.includes(tag));

      if (filteredTasks.length < 1) {
        const projectInfo = await Project.findById(project);
        return res.status(200).json({ project: projectInfo, tasks: [] });
      }

      return res
        .status(200)
        .json({ project: filteredTasks[0].project, tasks: filteredTasks });
    }

    const tasks = await Task.find(queryParams)
      .populate("owners", "_id name")
      .populate("project", "_id name description");

    res.status(200).json({ project: tasks[0].project, tasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/task/:taskId", verifyJWT, async (req, res) => {
  const taskId = req.params.taskId;

  try {
    if (!taskId) {
      return res.status(400).json({ error: "Task Id is required" });
    }

    const taskData = await Task.findById(taskId)
      .populate("owners", "_id name")
      .populate("project", "_id name description")
      .populate("team", "name");

    if (!taskData) {
      return res.status(404).json(taskData);
    }
    res.status(200).json(taskData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/tags", verifyJWT, async (req, res) => {
  try {
    const allTags = await Tag.find();
    res.status(200).json(allTags);
  } catch (error) {
    res.status(500).json({ error: "Internal server problem" });
  }
});

app.get("/report/last-week", verifyJWT, async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const lastWeekTasks = await Task.find({
      status: "Completed",
      updatedAt: { $lte: sevenDaysAgo },
    });

    if (lastWeekTasks.length < 1) {
      return res
        .status(404)
        .json({ error: "Reports of desired Tasks not found" });
    }
    res.status(200).json(lastWeekTasks);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/report/closed-tasks", verifyJWT, async (req, res) => {
  try {
    const allClosedTasks = await Task.find({
      status: "Completed",
    }).populate("team", "_id name");

    if (allClosedTasks.length < 1) {
      return res
        .status(404)
        .json({ error: "Reports of desired Tasks not found" });
    }

    const allTeams = await Team.find();
    const reports = allTeams.map((team) => {
      const totalClosedTasks = allClosedTasks.filter(
        (task) => task.team.name === team.name
      );
      return { name: team.name, completedTasks: totalClosedTasks.length };
    });
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/report/pending", async (req, res) => {
  try {
    const notCompletedTasks = await Task.find(
      { status: { $ne: "Completed" } },
      { name: 1, project: 1, timeToComplete: 1, status: 1, createdAt: 1 }
    ).populate("project", "name");

    if (notCompletedTasks.length < 1)
      return res.status(404).json({ error: "Pending Tasks not found" });

    const projects = await Project.find();

    const pendingTasks = projects.map((project) => {
      const filteredTasks = notCompletedTasks.filter(
        (task) => task.project.name === project.name
      );

      const totalPendingDays = filteredTasks.reduce(
        (acc, cur) => {
          const taskClosingDate = new Date(cur.createdAt);
          taskClosingDate.setDate(
            taskClosingDate.getDate() + cur.timeToComplete
          );

          const today = new Date();
          const daysDiffTimestamp = taskClosingDate - today;
          const pendingDays = Math.ceil(
            daysDiffTimestamp / (1000 * 60 * 60 * 24)
          );

          if (pendingDays < 0) return acc;

          if (pendingDays > acc.remainingDays) {
            acc.remainingDays = pendingDays;
          }

          return acc;
        },
        { remainingDays: 0 }
      );

      return {
        project: project.name,
        remainingDaysToClose: totalPendingDays.remainingDays,
      };
    });

    res.status(200).json(pendingTasks);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//POST CALL
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "Name, Email and Password fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    const savedUser = await newUser.save();
    res.status(201).json({
      message: "User has successfully registered",
      name: savedUser.name,
      email: savedUser.email,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 11000) {
      return res
        .status(409)
        .json({ error: "This email is already registered" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and Password are required" });
  }

  try {
    const findUser = await User.findOne({ email });

    if (!findUser) {
      return res.status(401).json({ error: "Invalid Email" });
    }

    const isValidPassword = await bcrypt.compare(password, findUser.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid Password" });
    }

    const token = jwt.sign({ role: "user" }, JWT_SECRET, { expiresIn: "1h" });

    return res.status(200).json({ message: "Logged in successfully", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to Login" });
  }
});

app.post("/teams", verifyJWT, async (req, res) => {
  const { name, description } = req.body;
  try {
    if (!name) {
      return res.status(400).json({ error: "Team name is required" });
    }

    const newTeam = new Team({ name, description });
    const savedTeam = await newTeam.save();

    res.status(201).json(savedTeam);
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ error: `Team name (${name}) already exists` });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/projects", verifyJWT, async (req, res) => {
  const { name, description } = req.body;
  try {
    if (!name) {
      return res.status(400).json({ error: "Project name is required" });
    }

    const newProject = new Project({ name, description });
    const savedProject = await newProject.save();

    res.status(201).json(savedProject);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/tasks", verifyJWT, async (req, res) => {
  const taskToAdd = req.body;
  const { name, project, team, owners, timeToComplete, status } = taskToAdd;
  try {
    if (!name || !project || !team || !owners || !timeToComplete || !status) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const newTask = new Task(taskToAdd);
    const savedTask = await newTask.save();

    await savedTask.populate("owners", "name _id");

    res.status(201).json(savedTask);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/task", verifyJWT, async (req, res) => {
  const { taskId, status } = req.body;

  try {
    if (!taskId) {
      return res.status(400).json({ error: "Task Id is required" });
    }
    const taskData = await Task.findByIdAndUpdate(
      taskId,
      { status: "Completed" },
      { new: true }
    )
      .populate("owners", "_id name")
      .populate("project", "_id name description")
      .populate("team", "name");
    if (!taskData) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json(taskData);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/tags", async (req, res) => {
  const { name } = req.body;

  try {
    if (!name) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const newTag = new Tag({ name });
    const saveTag = await newTag.save();
    res.status(201).json(saveTag);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "This Tag is already exists" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3000, () => {
  console.log("Server is running on PORT 3000");
});

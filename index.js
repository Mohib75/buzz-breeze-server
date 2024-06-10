const express = require("express")
const app = express()
require("dotenv").config()
const cors = require("cors")
const cookieParser = require("cookie-parser")
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb")
const jwt = require("jsonwebtoken")
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 5000

// middleware
const corsOptions = {
	origin: ["http://localhost:5173", "http://localhost:5174", "https://buzz-breeze.web.app", "https://buzz-breeze.firebaseapp.com"],
	credentials: true,
	optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
	const token = req.cookies?.token
	console.log(token)
	if (!token) {
		return res.status(401).send({ message: "unauthorized access" })
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			console.log(err)
			return res.status(401).send({ message: "unauthorized access" })
		}
		req.user = decoded
		next()
	})
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs81nyj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
})

async function run() {
	try {
		const db = client.db("buzzBreeze")
		const usersCollection = db.collection("users")
		const tagsCollection = db.collection("tags")
		const announcementsCollection = db.collection("announcements")
		const postsCollection = db.collection("posts")
		const commentsCollection = db.collection("comments")
		const reportsCollection = db.collection("reports")
		// verify admin middleware
		const verifyAdmin = async (req, res, next) => {
			console.log("hello")
			const user = req.user
			const query = { email: user?.email }
			const result = await usersCollection.findOne(query)
			console.log(result?.role)
			if (!result || result?.role !== "admin") return res.status(401).send({ message: "unauthorized access!!" })

			next()
		}

		// auth related api
		app.post("/jwt", async (req, res) => {
			const user = req.body
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "365d",
			})
			res.cookie("token", token, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production",
				sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
			}).send({ success: true })
		})

		// Logout
		app.get("/logout", async (req, res) => {
			try {
				res.clearCookie("token", {
					maxAge: 0,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
				}).send({ success: true })
				console.log("Logout successful")
			} catch (err) {
				res.status(500).send(err)
			}
		})

		// create-payment-intent
		// app.post("/create-payment-intent", async (req, res) => {
		// 	const price = req.body.price
		// 	const priceInCent = parseFloat(price) * 100
		// 	if (!price || priceInCent < 1) return
		// 	// generate clientSecret
		// 	const { client_secret } = await stripe.paymentIntents.create({
		// 		amount: priceInCent,
		// 		currency: "usd",
		// 		// In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
		// 		automatic_payment_methods: {
		// 			enabled: true,
		// 		},
		// 	})
		// 	// send client secret as response
		// 	res.send({ clientSecret: client_secret })
		// })

		// save a user data in db
		app.put("/user", async (req, res) => {
			const user = req.body

			const query = { email: user?.email }
			// check if user already exists in db
			const isExist = await usersCollection.findOne(query)
			if (isExist) {
				if (user.status === "Requested") {
					// if existing user try to change his role
					const result = await usersCollection.updateOne(query, {
						$set: { status: user?.status },
					})
					return res.send(result)
				} else {
					// if existing user login again
					return res.send(isExist)
				}
			}

			// save user for the first time
			const options = { upsert: true }
			const updateDoc = {
				$set: {
					...user,
					timestamp: Date.now(),
				},
			}
			const result = await usersCollection.updateOne(query, updateDoc, options)

			res.send(result)
		})

		// save a user data in db
		app.patch("/user", async (req, res) => {
			const user = req.body
			const { email, status, badge, transactionId } = user
			const query = { email }
			console.log(email)

			const updateDoc = {
				$set: { status, badge, transactionId }, // update specific fields
			}

			try {
				const result = await usersCollection.updateOne(query, updateDoc)
				if (result.matchedCount === 0) {
					console.warn("User not found for update:", email)
					// Handle non-existent user case (e.g., log or send error message)
				} else {
					res.send(result)
				}
			} catch (err) {
				console.error("Error updating user data:", err)
				res.status(500).send({ message: "Error updating user" }) // handle error
			}
		})

		// get a user info by email from db
		app.get("/user/:email", async (req, res) => {
			const email = req.params.email
			const result = await usersCollection.findOne({ email })
			res.send(result)
		})

		// get all users data from db
		app.get("/users", async (req, res) => {
			const result = await usersCollection.find().toArray()
			res.send(result)
		})

		//update a user role
		app.patch("/users/update/:email", async (req, res) => {
			const email = req.params.email
			const user = req.body
			const query = { email }
			const updateDoc = {
				$set: { ...user, timestamp: Date.now() },
			}
			const result = await usersCollection.updateOne(query, updateDoc)
			res.send(result)
		})

		// add tags bu admin
		app.post("/addTags", async (req, res) => {
			const tagData = req.body
			const result = await tagsCollection.insertOne(tagData)
			res.send(result)
		})

		// get all tags
		app.get("/tags", async (req, res) => {
			const result = await tagsCollection.find().toArray()
			res.send(result)
		})

		// add announcement by admin
		app.post("/addAnnouncement", async (req, res) => {
			const announcementData = req.body
			const result = await announcementsCollection.insertOne(announcementData)
			res.send(result)
		})

		// get all tags
		app.get("/announcements", async (req, res) => {
			const result = await announcementsCollection.find().toArray()
			res.send(result)
		})

		// add post by user
		app.post("/addPost", async (req, res) => {
			const postData = req.body
			const result = await postsCollection.insertOne(postData)
			res.send(result)
		})

		// get all posts
		app.get("/posts", async (req, res) => {
			const tags = req.query.tags
			const page = parseInt(req.query.page)
			const size = parseInt(req.query.size)
			let query = {}
			if (tags && tags !== "null") query = { tags }
			const result = await postsCollection
				.find(query)
				.skip(page * size)
				.limit(size)
				.toArray()
			res.send(result)
		})

		// get the users count
		app.get("/usersCount", async (req, res) => {
			const count = await usersCollection.estimatedDocumentCount()
			res.send({ count })
		})

		// get the post count
		app.get("/postsCount", async (req, res) => {
			const count = await postsCollection.estimatedDocumentCount()
			console.log(count)
			res.send({ count })
		})

		// get the announcement count
		app.get("/announcementsCount", async (req, res) => {
			const count = await announcementsCollection.estimatedDocumentCount()
			console.log(count)
			res.send({ count })
		})

		// get all posts for user
		app.get("/myPosts/:email", async (req, res) => {
			const email = req.params.email
			const page = parseInt(req.query.page)
			const size = parseInt(req.query.size)

			let query = { email: email }
			const result = await postsCollection
				.find(query)
				.skip(page * size)
				.limit(size)
				.toArray()

			res.send(result)
		})

		// get all posts for user
		app.get("/myPostsCount/:email", async (req, res) => {
			const email = req.params.email

			try {
				const query = { email: email }
				const count = await postsCollection.countDocuments(query)
				res.send({ count })
			} catch (error) {
				console.error("Error counting documents:", error)
				res.status(500).send({ error: "Failed to count posts" })
			}
		})

		// get the comment count
		app.get("/commentsCount", async (req, res) => {
			const count = await commentsCollection.estimatedDocumentCount()
			res.send({ count })
		})

		// get comments by title
		app.get("/myCommentCount/:title", async (req, res) => {
			const title = req.params.title

			try {
				const query = { title: title }
				const count = await commentsCollection.countDocuments(query)
				res.send({ count })
			} catch (error) {
				console.error("Error counting documents:", error)
				res.status(500).send({ error: "Failed to count posts" })
			}
		})

		// delete a post
		app.delete("/post/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await postsCollection.deleteOne(query)
			res.send(result)
		})

		// Get a single room data from db using _id
		app.get("/post/:id", async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }
			const result = await postsCollection.findOne(query)
			res.send(result)
		})

		// add comment by user
		app.post("/addComment", async (req, res) => {
			const commentData = req.body
			const result = await commentsCollection.insertOne(commentData)
			res.send(result)
		})

		// add report by user
		app.post("/addReport", async (req, res) => {
			const reportData = req.body
			const result = await reportsCollection.insertOne(reportData)
			res.send(result)
		})

		// get all reports
		app.get("/reports", async (req, res) => {
			const result = await reportsCollection.find().toArray()
			res.send(result)
		})

		// Get comment bu title
		app.get("/comment/:title", async (req, res) => {
			const title = req.params.title
			console.log(title)
			let query = { title: title }
			const result = await commentsCollection.find(query).toArray()
			res.send(result)
		})

		// update Room Status
		app.patch("/post/:id", async (req, res) => {
			const id = req.params.id
			const upvote = req.body.upvote
			const downvote = req.body.downvote
			// change room availability status
			const query = { _id: new ObjectId(id) }
			const updateDoc = {
				$set: { upvote: upvote, downvote: downvote },
			}
			const result = await postsCollection.updateOne(query, updateDoc)
			res.send(result)
		})

		// Send a ping to confirm a successful connection
		// await client.db("admin").command({ ping: 1 })
		console.log("Pinged your deployment. You successfully connected to MongoDB!")
	} finally {
		// Ensures that the client will close when you finish/error
	}
}
run().catch(console.dir)

app.get("/", (req, res) => {
	res.send("Hello from BuzzBreeze Server..")
})

app.listen(port, () => {
	console.log(`BuzzBreeze is running on port ${port}`)
})

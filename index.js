const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 9000;

// middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    // "https://stayvision-e5db4.web.app",
    //"https://stayvision-e5db4.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  //console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      //console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.epjsucj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.mq0mae1.mongodb.net/?retryWrites=true&w=majority&appName=Main`

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // const db = client.db('stayvista')
    // const roomsCollection = db.collection('rooms')
    // const usersCollection = db.collection('users')
    // const bookingsCollection = db.collection('bookings')

    const db = client.db("stayvision");
    const studySessionCollection = db.collection("session");
    const usersCollection = db.collection("users");
    //const cartCollection = db.collection("carts");
    const reviewCollection = db.collection("reviews");
    const noteCollection = db.collection("notes");
    const bookingsCollection = db.collection("bookings");
    const rejectedSessionFeedbackCollection = db.collection("rejectedFeedback");
    const uploadMaterialsCollection = db.collection("materials");

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      //console.log(token, "in baxj");
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ token });
    });

    //middlewares
    const verifyToken = async (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);

      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //use verify tutor after verifyToken
    const verifyTutor = async (req, res, next) => {
      const email = req.decoded.email;
      query = { email: email };
      const user = await usersCollection.findOne(query);
      const isTutor = user?.role === "tutor";
      if (!isTutor) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //use verify student after verifyToken
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      query = { email: email };
      const user = await usersCollection.findOne(query);
      const isStudent = user?.role === "student";
      if (!isStudent) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        //console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    //create-payment-intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) return;

      //Generat client secret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });

      //send client secret as a token
      res.send({
        clientSecret: client_secret,
      });
    });

    // save a user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;
      //console.log(user);

      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.status === "Requested") {
          // if existing user try to change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }

        return res.send(isExist);
      }

      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);

      // // welcome new user
      // sendEmail(user?.email, {
      //   subject: 'Welcome to Stayvista!',
      //   message: `Hope you will find you destination`,
      // })

      res.send(result);
    });

    //update a user role
    app.patch("/users/update/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: { ...user, timestamp: Date.now() },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // // get all study session form db
    // app.get("/all-sessions", async (req, res) => {
    //   const result = await studySessionCollection.find().toArray();
    //   res.send(result);
    // });

    // Get all jobs data from db for pagination
    app.get("/all-sessions", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      let search = req.query.search;
      console.log(size, page, filter, search, sort);

      if (typeof search !== "string") {
        search = ""; // Set to an empty string if not provided or not a string
      }

      let query = {
        title: { $regex: search, $options: "i" },
      };

      // Get current date and format it as 'YYYY-MM-DD'
      const currentDate = new Date().toISOString().split("T")[0];
      //console.log("Current Date:", currentDate);

      if (filter && filter === "ongoing") {
        query.registration_end_date = { $gt: currentDate };
      }

      if (filter && filter === "closed") {
        query.registration_end_date = { $lte: currentDate };
      }

      let options = {};
      if (sort)
        options = { sort: { registration_fee: sort === "dsc" ? 1 : -1 } };
      const result = await studySessionCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all jobs data count from db
    app.get("/all-sessions-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      let query = {
        title: { $regex: search, $options: "i" },
      };
      //if (filter) query.role = filter;

      //console.log(query, search, filter);
      //const count = await studySessionCollection.countDocuments(query);
      const count = await studySessionCollection.countDocuments();

      res.send({ count });
    });

    // Get all (user) tutor profile from db
    app.get("/user", async (req, res) => {
      //const category = req.query.category;
      const role = req.query.role;
      console.log(role);
      let query = {};
      if (role && role !== "null") query = { role: role };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // cart (order book) booking collection
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    //get booking order
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // Get a single bookings details data from db using _id
    app.get("/bookings/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    // collecting review and rating in reviewcollection
    app.post("/reviews", async (req, res) => {
      const reviewItem = req.body;
      const result = await reviewCollection.insertOne(reviewItem);
      res.send(result);
    });

    // saving notes data in noteCollection
    app.post("/notes", async (req, res) => {
      const noteItems = req.body;
      const result = await noteCollection.insertOne(noteItems);
      res.send(result);
    });

    //get notes data from db in manageNotes route
    app.get("/notes", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await noteCollection.find(query).toArray();
      res.send(result);
    });

    //delete notes
    app.delete("/notes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await noteCollection.deleteOne(query);
      res.send(result);
    });

    // Get a single notes data from db using _id
    app.get("/note/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await noteCollection.findOne(query);
      res.send(result);
    });

    // update notes data in db
    app.put("/update-notes/:id", async (req, res) => {
      const id = req.params.id;
      const roomData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: roomData,
      };
      const result = await noteCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //TUTOR ROUTE
    //add study session
    app.post("/session", async (req, res) => {
      const studySession = req.body;
      const result = await studySessionCollection.insertOne(studySession);
      res.send(result);
    });

    // Get a single session data from db using _id
    app.get("/session/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studySessionCollection.findOne(query);
      res.send(result);
    });

    // get all session posted by a specific user by email from db
    app.get("/sessions/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { tutor_email: email };
      const result = await studySessionCollection.find(query).toArray();
      res.send(result);
    });

    // get all session for admin for approve and delete
    //verifyToken,
    app.get("/all-session", verifyToken, async (req, res) => {
      const result = await studySessionCollection.find().toArray();
      res.send(result);
    });

    // //Get all bid requests from db for job owner
    // app.get("/bid-requests/:email", verifyToken, async (req, res) => {
    //   const email = req.params.email;
    //   const query = { "buyer.email": email };
    //   const result = await bidsCollection.find(query).toArray();
    //   res.send(result);
    // });

    // Update Bid status
    app.patch("/session/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: status,
      };
      const result = await studySessionCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //Provide feedback for rejected session
    app.post("/rejected-feedback", async (req, res) => {
      const rejectedSession = req.body;
      console.log(rejectedSession);
      const result = await rejectedSessionFeedbackCollection.insertOne(
        rejectedSession
      );
      res.send(result);
    });

    //get all
    app.get("/rejectFeedback/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await rejectedSessionFeedbackCollection
        .find(query)
        .toArray();
      res.send(result);
    });

    // Get a single rejected details from db using _id
    app.get("/rejectDetails/:id", async (req, res) => {
      //const rejectedData = req.body;
      const id = req.params.id;
      const query = { rejectdeId: id };
      const result = await rejectedSessionFeedbackCollection.findOne(query);
      res.send(result);
    });

    // Get a single details for upload meterials route from db using _id
    app.get("/uploadDetails/:id", async (req, res) => {
      //const rejectedData = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studySessionCollection.findOne(query);
      res.send(result);
    });

    // upload-materials
    //Upload Materials for Approved Study Session
    app.post("/upload-materials", async (req, res) => {
      const uploadMaterials = req.body;
      console.log(uploadMaterials);
      const result = await uploadMaterialsCollection.insertOne(uploadMaterials);
      res.send(result);
    });

    // Get a single details for update meterials route from db using _id
    app.get("/updateMaterials/:id", async (req, res) => {
      const id = req.params.id;
      const query = { materialId: id };
      const result = await uploadMaterialsCollection.findOne(query);
      res.send(result);
    });

    // Get booked meterials for student from db using _id
    app.get("/view-booked-materials/:id", async (req, res) => {
      const id = req.params.id;
      console.log("id of wiew booked =>", id);
      const query = { materialId: id };
      const result = await uploadMaterialsCollection.find(query).toArray();
      res.send(result);
    });

    // get all materials for specific tutor by email from db
    app.get("/materials/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await uploadMaterialsCollection.find(query).toArray();
      res.send(result);
    });

    // view all materials for admin
    app.get("/view-all-materials", verifyToken, async (req, res) => {
      const result = await uploadMaterialsCollection.find().toArray();
      res.send(result);
    });

    // update a materials in db
    app.put("/update-materials/:id", async (req, res) => {
      const id = req.params.id;
      const updateMaterials = req.body;
      const query = { materialId: id };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...updateMaterials,
        },
      };
      const result = await uploadMaterialsCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // delete a materials data from db by tutor
    app.delete("/materials/:id", async (req, res) => {
      const id = req.params.id;
      const query = { materialId: id };
      const result = await uploadMaterialsCollection.deleteOne(query);
      res.send(result);
    });

    // delete a job data from db
    app.delete("/session/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studySessionCollection.deleteOne(query);
      res.send(result);
    });

    // update a job in db
    app.put("/session/:id", async (req, res) => {
      const id = req.params.id;
      const newStudySession = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...newStudySession,
        },
      };
      const result = await studySessionCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    //save a booking data in db
    app.post("/booking", verifyToken, async (req, res) => {
      const bookingData = req.body;
      //save room booking info
      const result = await bookingsCollection.insertOne(bookingData);

      // //change avaiblity status
      // const sessionId = bookingData?.sessionId;
      // const query = { _id: new ObjectId(sessionId) };
      // const updateDoc = {
      //   $set: { booked: true },
      // };

      // const updatedRoom = await studySessionCollection.updateOne(query, updateDoc);
      // console.log(updatedRoom);

      res.send(result);
    });

    //Update booking session status
    app.patch("/session/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      //change avaiblity status
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { booked: status },
      };
      const result = await studySessionCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //get all booking for a student
    app.get("/myBooking/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "student.email": email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // //get all users from db
    // app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
    //   const result = await usersCollection.find().toArray();
    //   res.send(result);
    // });

    // Get all jobs data from db for pagination
    app.get("/all-users", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;
      console.log(size, page, filter, sort);

      let query = {
        email: { $regex: search, $options: "i" },
      };
      if (filter) query.role = filter;
      let options = {};
      if (sort) options = { sort: { timestamp: sort === "asc" ? 1 : -1 } };
      const result = await usersCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all jobs data count from db
    app.get("/users-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      let query = {
        email: { $regex: search, $options: "i" },
      };
      if (filter) query.role = filter;

      console.log(query, filter);
      const count = await usersCollection.countDocuments(query);
      //const count = await usersCollection.countDocuments()

      res.send({ count });
    });

    //FOR STATISTICS
    //ADMIN STATISTICS
    app.get("/admin-stat", verifyToken, verifyAdmin, async (req, res) => {
      const bookingDetails = await bookingsCollection
        .find(
          {},
          {
            projection: {
              date: 1,
              price: 1,
            },
          }
        )
        .toArray();

      const totalStudent = await usersCollection.countDocuments({
        role: "student",
      });
      const totalSession = await studySessionCollection.countDocuments();
      const totalPrice = bookingDetails.reduce(
        (sum, booking) => sum + parseFloat(booking.price || 0), // Convert price to number, default to 0 if it's invalid
        0
      );

      // const data = [
      //   ['Day', 'Sales'],
      //   ['9', 1000],
      //   ['10', 1170],
      //   ['11/3', 660],
      //   ['12/1', 1030],
      // ]
      const chartData = bookingDetails.map((booking) => {
        const day = new Date(booking.date).getDate();
        const month = new Date(booking.date).getMonth() + 1;
        const data = [`${day}/${month}`, Number(booking?.price || 0)];
        return data;
      });
      chartData.unshift(["Day", "Sales"]);
      //chartData.splice(0,0,['Day', 'Sales'])

      res.send({
        bookingDetails,
        totalStudent,
        totalSession,
        totalBookings: bookingDetails.length,
        totalPrice,
        chartData,
      });
    });

    //TUTOR STATISTICS
    app.get("/tutor-stat", verifyToken, verifyTutor, async (req, res) => {
      const { email } = req.decoded;
      const bookingDetails = await bookingsCollection
        .find(
          {
            tutor_email: email,
          },
          {
            projection: {
              date: 1,
              price: 1,
            },
          }
        )
        .toArray();

      const totalSession = await studySessionCollection.countDocuments({
        tutor_email: email,
      });
      const totalPrice = bookingDetails.reduce(
        (sum, booking) => sum + parseFloat(booking.price || 0), // Convert price to number, default to 0 if it's invalid
        0
      );
      const { timestamp } = await usersCollection.findOne(
        { email },
        { projection: { timestamp: 1 } }
      );

      const chartData = bookingDetails.map((booking) => {
        const day = new Date(booking.date).getDate();
        const month = new Date(booking.date).getMonth() + 1;
        const data = [`${day}/${month}`, Number(booking?.price || 0)];
        return data;
      });
      chartData.unshift(["Day", "Sales"]);
      //chartData.splice(0,0,['Day', 'Sales'])

      res.send({
        totalSession,
        totalBookings: bookingDetails.length,
        totalPrice,
        chartData,
        TutorSince: timestamp,
      });
    });

    //STUDENT STATISTICS
    app.get("/student-stat", verifyToken, verifyStudent, async (req, res) => {
      const { email } = req.decoded;
      const bookingDetails = await bookingsCollection
        .find(
          {
            "student.email": email,
          },
          {
            projection: {
              date: 1,
              price: 1,
            },
          }
        )
        .toArray();

      const totalPrice = bookingDetails.reduce(
        (sum, booking) => sum + parseFloat(booking.price || 0), // Convert price to number, default to 0 if it's invalid
        0
      );
      const { timestamp } = await usersCollection.findOne(
        { email },
        { projection: { timestamp: 1 } }
      );

      const chartData = bookingDetails.map((booking) => {
        const day = new Date(booking.date).getDate();
        const month = new Date(booking.date).getMonth() + 1;
        const data = [`${day}/${month}`, Number(booking?.price || 0)];
        return data;
      });
      chartData.unshift(["Day", "Sales"]);
      //chartData.splice(0,0,['Day', 'Sales'])

      res.send({
        totalPrice,
        totalBookings: bookingDetails.length,
        StudentSince: timestamp,
        chartData,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from StayVista Server..");
});

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`);
});

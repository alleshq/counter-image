const fs = require("fs");
const credentials = require("./credentials");

// Database
const Sequelize = require("sequelize");
const sequelize = new Sequelize(
	"counter",
	credentials.db.username,
	credentials.db.password,
	{
		host: credentials.db.host,
		dialect: "mariadb",
		dialectOptions: {
			timezone: "Etc/GMT0"
		},
		logging: false
	}
);
const Request = sequelize.define(
	"request",
	{
		code: {
			type: Sequelize.STRING,
			allowNull: false
		},
		url: {
			type: Sequelize.STRING
		},
		address: {
			type: Sequelize.STRING,
			allowNull: false
		}
	},
	{
		updatedAt: false
	}
);

// Image
const template = fs
	.readFileSync(__dirname + "/template.svg", "utf8")
	.split("[x]");
const svg2png = require("svg2png");
const image = content => {
	const svg = template[0] + content + template[1];
	const png = svg2png.sync(svg);
	return png;
};

// Express
const express = require("express");
const app = express();
const cors = require("cors");
app.set("trust proxy", 1);
app.listen(8007);

// Ratelimiting
const ratelimit = require("express-rate-limit")({
	windowMs: 1000 * 60,
	max: 60,
	message: "You have angered the gods."
});

// Static Site
app.use(express.static(__dirname + "/site"));

// Stats
let stats = {};
app.get("/stats", (req, res) => res.json(stats));
const updateStats = async () => {
	stats = {
		total: await Request.count(),
		addresses: await Request.count({
			distinct: true,
			col: "address"
		}),
		codes: await Request.count({
			distinct: true,
			col: "code"
		}),
		urls: await Request.count({
			distinct: true,
			col: "url"
		}),
		day: await Request.count({
			where: {
				createdAt: {
					[Sequelize.Op.gte]: new Date().getTime() - 1000 * 60 * 60 * 24
				}
			}
		}),
		month: await Request.count({
			where: {
				createdAt: {
					[Sequelize.Op.gte]: new Date().getTime() - 1000 * 60 * 60 * 24 * 30
				}
			}
		})
	};
};
updateStats();
setInterval(updateStats, 60000);

// Image Counter
app.get("/:code", cors(), ratelimit, async (req, res) => {
	const {code} = req.params;
	if (code.length > 16)
		return res.status(400).send("Code must 16 characters or less");

	const count =
		(await Request.count({
			where: {
				code,
				createdAt: {
					[Sequelize.Op.gte]: new Date().getTime() - 1000 * 60 * 60 * 24
				}
			}
		})) + 1;

	Request.create({
		code,
		url: req.headers.referer,
		address: req.ip
	});

	if (typeof req.query.text !== "undefined") {
		res.send(count.toString());
	} else {
		var img;
		try {
			img = image(count);
		} catch (err) {
			return res.status(500).send("Something went wrong.");
		}

		res.type("image/png").send(img);
	}
});

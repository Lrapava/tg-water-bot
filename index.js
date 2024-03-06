const { Bot } = require("grammy");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { uri, APItoken } = require('private.js')

const bot = new Bot(APItoken);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const db_name = "water_bot"
const collection_name = "users"
const usersCollection = client.db(db_name).collection(collection_name)

let activeUsers = new Map()

function getId(ctx) { return Number(ctx.from?.id || 0) }

async function safeReply(ctx, text) {
	try { await ctx.reply(text) } catch (error) {
		console.log(error)
		if (error.error_code == 403) {

			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), paused: true})
			const old_data = await usersCollection.findOne({ _id : getId(ctx) })
			await usersCollection.replaceOne({ _id : old_data._id }, activeUsers.get(getId(ctx)))

			activeUsers.delete(getId(ctx))
		}
	}
}

async function notify(id) {
	for (;;) {
		await new Promise(r => setTimeout(r, activeUsers.get(id).period * 1000));
		if (activeUsers.get(id).paused) return
		try { await bot.api.sendMessage(id, "DRINK WATER YOU STOOPID GOOSE") } catch (error) {
			console.log(error)
			if (error.error_code == 403) {
				activeUsers.set(id, {...activeUsers.get(id), paused: true})
				activeUsers.delete(id)
			}
			return
		}
	}
}

bot.command("pause", async (ctx) => {
	if (activeUsers.has(getId(ctx)) && activeUsers.get(getId(ctx)).state == "done") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), paused: true})
		await usersCollection.updateOne({ _id : getId(ctx) }, { $set: { paused: true} })
		safeReply(ctx, "Fine, I won't bother you.")
	}
});


bot.command("continue", async (ctx) => {
	if (!activeUsers.has(getId(ctx)) || activeUsers.get(getId(ctx)).paused == true) {
		const old_data = await usersCollection.findOne({ _id : getId(ctx) })
		activeUsers.set(getId(ctx), {...old_data, paused: false})
		await usersCollection.updateOne({ _id : getId(ctx) }, { $set: { paused: false} })
		notify(getId(ctx));
		safeReply(ctx, "Ok, I will continue bothering you every "+(activeUsers.get(getId(ctx)).period)/60+" minutes!!!!")
	}
});

bot.command("start", async (ctx) => {
	activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), _id: getId(ctx), state: "age", paused: false})
	safeReply(ctx, "Hello. I am a duck.")
	await new Promise(r => setTimeout(r, 500));
	safeReply(ctx, "I am gonna make you stay hydrated whether you want it or not UwU")
	await new Promise(r => setTimeout(r, 500));
	safeReply(ctx, "Please enter your age:")
});

bot.command("reconf", async (ctx) => {
	if (!activeUsers.has(getId(ctx))) {
		if (usersCollection.countDocuments({_id: getId(ctx)}) == 0) {
			safeReply(ctx, "Can't /reconf until you finnish initial configuration") 
			return
		}
		activeUsers.set(getId(ctx), await usersCollection.findOne({ _id: getId(ctx) }))
	}
	if (activeUsers.get(getId(ctx)).paused != true) {
		safeReply(ctx, "Please /pause before /reconf") 
	} else
	if (activeUsers.get(getId(ctx)).state == "done") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), state:"age"})
		safeReply(ctx, "Please enter your age:")
	} else safeReply(ctx, "Can't /reconf until you finnish initial configuration") 
});


bot.command("male", async (ctx) => {
	if (activeUsers.has(getId(ctx)) && activeUsers.get(getId(ctx)).state == "gender") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), gender: true})
		if (activeUsers.get(getId(ctx)).state == "gender") {
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), state: "units"})
			safeReply(ctx, "Do you prefer /metric or /empirial ?")
		}
	}
});

bot.command("female", async (ctx) => {
	if (activeUsers.has(getId(ctx)) && activeUsers.get(getId(ctx)).state == "gender") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), gender: false})
		if (activeUsers.get(getId(ctx)).state == "gender") {
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), state: "units"})
			safeReply(ctx, "Do you prefer /metric or /empirial ?")
		}
	}
});

bot.command("metric", async (ctx) => { 
	if (activeUsers.has(getId(ctx)) && activeUsers.get(getId(ctx)).state == "units") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), units: true})
		safeReply(ctx, "Units set to metric.")

		await new Promise(r => setTimeout(r, 250));
		if (activeUsers.get(getId(ctx)).state == "units") {
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), state: "weight"})
			safeReply(ctx, "Please enter your weight in kilograms:")
		}
	}
});

bot.command("empirial", async (ctx) => { 
	if (activeUsers.has(getId(ctx)) && activeUsers.get(getId(ctx)).state == "units") {
		activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), units: false})
		safeReply(ctx, "I mean wtf is a kilometer, right?")

		await new Promise(r => setTimeout(r, 250));
		if (activeUsers.get(getId(ctx)).state == "units") {
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), state: "weight"})
			safeReply(ctx, "Please enter your weight in pounds:")
		}
	}
});

bot.on("message", async (ctx) => {
	switch (activeUsers.get(getId(ctx)).state) {
	case "age":
		if (isNaN(ctx.message.text)) {
			safeReply(ctx, "Something went wrong. Please try again")
		} else {
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), age: Number(ctx.message.text), state: "gender"})
			safeReply(ctx, "Are you a biological /male or /female ?")
		}
		break;
	case "weight":
		if (isNaN(ctx.message?.text || "x")) {
			safeReply(ctx, "Something went wrong. Please try again")
		} else {

			let weight = Number(ctx.message.text)
			if (activeUsers.get(getId(ctx)).units == false) weight *= 0.4535924;

			const id = getId(ctx)
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), weight: weight, state: "period"})
			await new Promise(r => setTimeout(r, 500));
			safeReply(ctx, "How often would you like to be notified? (in minutes)");
		}
		break
	case "period":
		if (isNaN(ctx.message?.text || "x")) {
			safeReply(ctx, "Something went wrong. Please try again")
		} else {
			let period = Number(ctx.message.text) * 60
			activeUsers.set(getId(ctx), {...activeUsers.get(getId(ctx)), period: period, state: "done"})

			if (await usersCollection.countDocuments({ _id : getId(ctx) }) == 0) {
				await usersCollection.insertOne(activeUsers.get(getId(ctx)))
			} else {
				await usersCollection.replaceOne({ _id : getId(ctx) }, activeUsers.get(getId(ctx)))
			}

			safeReply(ctx, "Setup complete! You can do this again any time using /reconf")
			await new Promise(r => setTimeout(r, 500));
			safeReply(ctx, "You are supposed to drink X liters or water a day")
			await new Promise(r => setTimeout(r, 500));
			if (activeUsers.get(getId(ctx)).paused) {
				safeReply(ctx, "Use /continue to get notified to drink water")
			} else safeReply(ctx, "I will remind you every " + (activeUsers.get(getId(ctx)).period)/60 + " minutes to drink water!")
			notify(getId(ctx))
		}
		break;
	default:
	}
})

async function main() {
	
	await usersCollection.find({ paused: false }).forEach((user) => {
		activeUsers.set(user._id, user)
		notify(user._id)
	})

	bot.start();

	await bot.api.setMyCommands([
		{ command: "reconf",	description: "Reconfigure the bot" },
		{ command: "pause",		description: "Pause notifications" },
		{ command: "continue",	description: "Continue getting notifications" },
		{ command: "donate",	description: "Support the developers" },
	]);
}

main()

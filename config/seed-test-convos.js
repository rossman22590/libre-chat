const path = require('path');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { Constants } = require('librechat-data-provider');
const { User, Conversation, Message } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

/**
 * Seeds a user with conversations for local export/import testing.
 * Usage: node config/seed-test-convos.js <email>
 */

const SEEDS = [
  {
    title: 'Recipe for sourdough bread',
    endpoint: 'openAI',
    model: 'gpt-4o',
    temperature: 0.7,
    turns: [
      ['How do I make a sourdough starter?', 'Mix equal parts flour and water, then feed it daily for about a week until it doubles reliably.'],
      ['How long should I bulk ferment?', 'Usually 4-6 hours at room temperature, until the dough has risen by roughly 50%.'],
      ['What oven temperature?', 'Preheat to 250C with a Dutch oven, bake 20 minutes covered then 20 uncovered.'],
    ],
  },
  {
    title: 'Debugging a memory leak in Node',
    endpoint: 'openAI',
    model: 'gpt-4o',
    temperature: 0.2,
    promptPrefix: 'You are a senior Node.js engineer.',
    turns: [
      ['My Node process grows to 2GB overnight. Where do I start?', 'Take heap snapshots at intervals with --inspect and compare retained sizes in Chrome DevTools.'],
      ['The retainer is an array of closures.', 'That usually means event listeners are never removed. Audit addListener calls without a matching removeListener.'],
    ],
  },
  {
    title: 'Trip planning: Lisbon in April',
    endpoint: 'openAI',
    model: 'gpt-4o-mini',
    turns: [
      ['Three days in Lisbon, what should I prioritise?', 'Day 1 Alfama and the cathedral, day 2 Belem and the monastery, day 3 a day trip to Sintra.'],
      ['Is April rainy?', 'Mild with occasional showers, around 18C. Pack a light rain jacket.'],
      ['Best pastry?', 'Pasteis de Belem, straight from the original bakery, dusted with cinnamon.'],
      ['Any day trips besides Sintra?', 'Cascais for the coast, or Setubal for seafood and dolphin watching.'],
    ],
  },
  {
    title: 'Explaining CRDTs to a frontend dev',
    endpoint: 'anthropic',
    model: 'claude-sonnet-4-5',
    turns: [
      ['What is a CRDT in one paragraph?', 'A data structure where concurrent edits from multiple replicas always converge to the same state without a central coordinator.'],
      ['How does that differ from OT?', 'OT transforms operations against each other and needs a server to order them. CRDTs encode ordering into the data itself.'],
    ],
  },
  {
    title: 'Empty conversation (no messages)',
    endpoint: 'openAI',
    model: 'gpt-4o',
    turns: [],
  },
];

/** A conversation with a branch, to exercise non-linear message trees */
const BRANCHED = {
  title: 'Branched: two answers to one question',
  endpoint: 'openAI',
  model: 'gpt-4o',
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function seedLinear(userId, seed, baseDate) {
  const conversationId = uuidv4();
  const messages = [];
  let parentMessageId = Constants.NO_PARENT;
  let offset = 0;

  for (const [userText, assistantText] of seed.turns) {
    const userMessageId = uuidv4();
    messages.push({
      messageId: userMessageId,
      conversationId,
      user: userId,
      parentMessageId,
      sender: 'User',
      text: userText,
      isCreatedByUser: true,
      endpoint: seed.endpoint,
      createdAt: new Date(baseDate.getTime() + offset * 60000),
      updatedAt: new Date(baseDate.getTime() + offset * 60000),
    });
    offset += 1;

    const assistantMessageId = uuidv4();
    messages.push({
      messageId: assistantMessageId,
      conversationId,
      user: userId,
      parentMessageId: userMessageId,
      sender: seed.endpoint === 'anthropic' ? 'Claude' : 'GPT-4',
      text: assistantText,
      isCreatedByUser: false,
      model: seed.model,
      endpoint: seed.endpoint,
      createdAt: new Date(baseDate.getTime() + offset * 60000),
      updatedAt: new Date(baseDate.getTime() + offset * 60000),
    });
    offset += 1;
    parentMessageId = assistantMessageId;
  }

  await Conversation.create({
    conversationId,
    user: userId,
    title: seed.title,
    endpoint: seed.endpoint,
    model: seed.model,
    temperature: seed.temperature,
    promptPrefix: seed.promptPrefix,
    isArchived: false,
    createdAt: baseDate,
    updatedAt: new Date(baseDate.getTime() + offset * 60000),
  });

  if (messages.length) {
    await Message.insertMany(messages);
  }
  return { conversationId, messageCount: messages.length };
}

async function seedBranched(userId, baseDate) {
  const conversationId = uuidv4();
  const rootId = uuidv4();
  const branchAId = uuidv4();
  const branchBId = uuidv4();
  const followUpId = uuidv4();

  const at = (m) => new Date(baseDate.getTime() + m * 60000);

  const messages = [
    {
      messageId: rootId,
      conversationId,
      user: userId,
      parentMessageId: Constants.NO_PARENT,
      sender: 'User',
      text: 'Give me a name for a coffee shop.',
      isCreatedByUser: true,
      endpoint: BRANCHED.endpoint,
      createdAt: at(0),
      updatedAt: at(0),
    },
    {
      messageId: branchAId,
      conversationId,
      user: userId,
      parentMessageId: rootId,
      sender: 'GPT-4',
      text: 'Branch A: "The Daily Grind" - familiar, punny, easy to remember.',
      isCreatedByUser: false,
      model: BRANCHED.model,
      endpoint: BRANCHED.endpoint,
      createdAt: at(1),
      updatedAt: at(1),
    },
    {
      messageId: branchBId,
      conversationId,
      user: userId,
      parentMessageId: rootId,
      sender: 'GPT-4',
      text: 'Branch B: "Ritual & Co." - calmer, leans upmarket.',
      isCreatedByUser: false,
      model: BRANCHED.model,
      endpoint: BRANCHED.endpoint,
      createdAt: at(2),
      updatedAt: at(2),
    },
    {
      messageId: followUpId,
      conversationId,
      user: userId,
      parentMessageId: branchBId,
      sender: 'User',
      text: 'I like Ritual & Co. Give me a tagline.',
      isCreatedByUser: true,
      endpoint: BRANCHED.endpoint,
      createdAt: at(3),
      updatedAt: at(3),
    },
  ];

  await Conversation.create({
    conversationId,
    user: userId,
    title: BRANCHED.title,
    endpoint: BRANCHED.endpoint,
    model: BRANCHED.model,
    isArchived: false,
    createdAt: baseDate,
    updatedAt: at(3),
  });
  await Message.insertMany(messages);
  return { conversationId, messageCount: messages.length };
}

(async () => {
  await connect();

  const email = process.argv[2];
  if (!email) {
    console.red('Usage: node config/seed-test-convos.js <email>');
    process.exit(1);
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red(`No user found with email ${email}`);
    process.exit(1);
  }

  const userId = user._id.toString();
  console.purple(`Seeding conversations for ${email} (${userId})`);

  let totalConvos = 0;
  let totalMessages = 0;

  for (let i = 0; i < SEEDS.length; i++) {
    const result = await seedLinear(userId, SEEDS[i], daysAgo(SEEDS.length - i));
    totalConvos += 1;
    totalMessages += result.messageCount;
    console.green(`  ${SEEDS[i].title} -> ${result.messageCount} messages`);
  }

  const branched = await seedBranched(userId, daysAgo(0));
  totalConvos += 1;
  totalMessages += branched.messageCount;
  console.green(`  ${BRANCHED.title} -> ${branched.messageCount} messages (branched)`);

  console.purple(`Done: ${totalConvos} conversations, ${totalMessages} messages`);
  process.exit(0);
})();

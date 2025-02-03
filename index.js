const { MongoClient } = require('mongodb');

const sourceClusterUri = process.env.SOURCE_MONGODB_URI;
const destinationClusterUri = process.env.DESTINATION_MONGODB_URI;
const createCollections = process.env.CREATE_COLLECTIONS === "1";

const sourceClient = new MongoClient(sourceClusterUri);
const destinationClient = new MongoClient(destinationClusterUri);
const excludedDbs = ["admin", "local", "config"];

const log = (msg, ...args) => console.log(new Date(), msg, ...args);

const connectToDBs = async () => {
    try {
        log("Connecting to the source cluster");
        await sourceClient.connect();
        log("Connected");
        log("Connecting to the destination cluster");
        await destinationClient.connect();
        log("Connected");
        return { sourceClient, destinationClient };
    } catch (error) {
        log('Error connecting to MongoDB:', error);
        throw error;
    }
}

const closeConnections = async () => {
    try {
        await sourceClient.close();
        await destinationClient.close();
    } catch (error) {
        log('Error closing connections:', error);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    await closeConnections();
    process.exit(0);
});

const migrateSearchIndexes = async () => {
    try {
        await connectToDBs();
        const admin = sourceClient.db("admin");
        const resp = await admin.command({ listDatabases: 1, nameOnly: true });
        const { databases } = resp;
        const dbNames = databases.map(({ name }) => name).filter(name => !excludedDbs.includes(name));
        await Promise.all(dbNames.map(dbName => migrateSearchIndexesByDb({ dbName })));
    } catch (error) {
        log('Error:', error);
        await closeConnections();
        process.exit(1);
    }
}

const collectionExists = async ({ db, name }) => {
    const collections = await db.listCollections({ name }).toArray();
    return collections.length > 0;
}

const migrateSearchIndexesByDb = async ({ dbName }) => {
    const sourceCollectionsCur = await sourceClient.db(dbName).listCollections();
    const collections = (await sourceCollectionsCur.toArray()).map(({ name }) => name);

    await Promise.all(collections.map(c => createSearchIndexesForCollection({ c, dbName })));
};

const createSearchIndexesForCollection = async ({ c, dbName }) => {
    const indexes = await getCollectionSearchIndexes({ collection: sourceClient.db(dbName).collection(c) });
    await Promise.all(indexes.map(ix => createSearchIndex({ c, ix, dbName })));
};

const createSearchIndex = async ({ c, ix, dbName }) => {
    const collection = destinationClient.db(dbName).collection(c);
    if (createCollections && !(await collectionExists({ db: destinationClient.db(dbName), name: c }))) {
        await destinationClient.db(dbName).createCollection(c);
    }
    try {
        await collection.createSearchIndex(ix);
        log("Created an Atlas Search index in the destination cluster", `${dbName}.${c}[${ix.name}]`);
    } catch (err) {
        const { code } = err;
        if (code === 26) {
            log(`The collection doesn't exist in the destination cluster - skipping the Search index:`, `${dbName}.${c}[${ix.name}]`);    
        } else if (code === 68) {
            log(`The Search index already exists:`, `${dbName}.${c}[${ix.name}]`);    
        } else {
            throw err;
        }
    }
};

const getCollectionSearchIndexes = async ({ collection }) => {
    return (await collection.listSearchIndexes().toArray())
        .map(({ name, latestDefinition, type }) => ({ name, definition: latestDefinition, type }));
};

migrateSearchIndexes().catch(console.error).finally(async () => {
    log("Done.");
    await closeConnections();
});

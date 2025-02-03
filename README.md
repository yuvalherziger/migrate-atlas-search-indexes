# migrate-atlas-search-indexes

## Install

```shell
npm i
```

## Run

Environment variables:

* `SOURCE_MONGODB_URI` (required): The MongoDB URI pointing to your source cluster
* `DESTINATION_MONGODB_URI` (required): The MongoDB URI pointing to your destination cluster
* `CREATE_COLLECTIONS` (optional, default: `0`): Whether the script should create collections that have a search index in the source cluster but don't yet exist in the destination cluster. Set to `1` to create the collections and their indexes even if they don't exist in the the destination cluster.

```shell
SOURCE_MONGODB_URI="<SOURCE MONGODB URI>" \
DESTINATION_MONGODB_URI="<DESTINATION MONGODB URI>" \
CREATE_COLLECTIONS=0 \
node index.js
```
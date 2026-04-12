import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FeedDeploy } from "../target/types/feed_deploy";

import { OracleJob, CrossbarClient, type IOracleJob } from "@switchboard-xyz/common";
import * as sb from "@switchboard-xyz/on-demand";

describe("feed-deploy", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.feedDeploy as Program<FeedDeploy>;

    it("Is initialized!", async () => {
        // Add your test here.
        //const tx = await program.methods.initialize().rpc();
        //console.log("------------", tx);

        const { program } = await sb.AnchorUtils.loadEnv();
        const queue = await sb.Queue.loadDefault(program!);
        const crossbar = new CrossbarClient("http://crossbar.switchboard.xyz");
        const gateway = await queue.fetchGatewayByLatestVersion(crossbar);
        const jobs: OracleJob[] = [

            OracleJob.fromObject({
                tasks: [
                    {
                        conditionalTask: {
                            // maybe nested conditional for adding a 3rd API, alphavantage endpoint
                            attempt: [
                                {
                                    httpTask: {
                                        url: "https://api.massive.com/v1/marketstatus/now?apiKey=${MASSIVE_API_KEY}",
                                    },
                                },
                                {
                                    jsonParseTask: { path: "$.exchanges.nyse" },
                                },
                                {
                                    stringMapTask: {
                                        mappings: [
                                            {
                                                key: "\"open\"", value: "1"
                                            },
                                            {
                                                key: "\"extended-hours\"", value: "2"
                                            },
                                            {
                                                key: "\"closed\"", value: "0"
                                            },
                                            {
                                                key: "\"halted\"", value: "3"
                                            }
                                        ],
                                        defaultValue: "6",
                                    }
                                },

                            ],
                            onFailure: [
                                {
                                    httpTask: {
                                        url: "https://api.earningsapi.com/v1/market-status?apikey=${EARNINGSAPI_KEY}",
                                    },
                                },
                                {
                                    jsonParseTask: { path: "$.currentMarketStatus" },
                                },
                                {
                                    stringMapTask: {
                                        mappings: [
                                            {
                                                key: "\"open\"", value: "1"
                                            },
                                            {
                                                key: "\"pre-market\"", value: "2"
                                            },
                                            {
                                                key: "\"after-hours\"", value: "2"
                                            },
                                            {
                                                key: "\"closed\"", value: "0"
                                            },
                                            {
                                                key: "\"halted\"", value: "3"
                                            }
                                        ],
                                        defaultValue: "6",
                                    }
                                },

                            ]
                        }
                    },
                ],
            }),
        ];

        const feed = {
            name: "Test API Feed:",
            jobs: [{ tasks: jobs[0]?.tasks }],
        };


        const provider = anchor.AnchorProvider.env();
        anchor.setProvider(provider);
        const connection = provider.connection;
        const depqueue = await sb.getDefaultQueue(connection.rpcEndpoint);
        const crossbarClient = CrossbarClient.default();
        const feedHash = await crossbarClient.storeOracleFeed(feed);
        console.log("FEED HASH::: ", feedHash);

        const [quoteAccount] = sb.OracleQuote.getCanonicalPubkey(depqueue.pubkey, [feedHash.toString()]);
        console.log("QUOTE ACCOUNT::::", quoteAccount.toBase58());

        const payer = sb.AnchorUtils.initKeypairFromFile("~/.config/solana/id.json")
        const updateIxs = await depqueue.fetchManagedUpdateIxs(crossbarClient, [feed], {
            payer: payer.publicKey,
        });

        const dtx = await sb.asV0Tx({
            connection,
            ixs: updateIxs,
            payer: payer.publicKey,
            signers: [payer],
        })

        const sig = await connection.sendTransaction(dtx);
        console.log("TRANSACTION SIGNATURE:::: ", sig);
        console.log("DEPLOY SUCCESS... quote account @ ", quoteAccount.toBase58());

    });
});

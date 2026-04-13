import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FeedDeploy } from "../target/types/feed_deploy";
import * as dotenv from "dotenv";

import { OracleJob, CrossbarClient, type IOracleJob, FeedHash } from "@switchboard-xyz/common";
import * as sb from "@switchboard-xyz/on-demand";

dotenv.config()

describe("feed-deploy", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.feedDeploy as Program<FeedDeploy>;

    it("Is initialized!", async () => {
        // Add your test here.
        //const tx = await program.methods.initialize().rpc();
        //console.log("------------", tx);


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

        const feedId = FeedHash.computeOracleFeedId(feed);

        const [quoteAccount] = sb.OracleQuote.getCanonicalPubkey(depqueue.pubkey, [feedId]);
        console.log("QUOTE ACCOUNT::::", quoteAccount.toBase58());

        console.log(process.env.MASSIVE_API_KEY);

        //        const payer = sb.AnchorUtils.initKeypairFromFile("~/.config/solana/id.json")
        const payer = (provider.wallet as anchor.Wallet).payer;
        const updateIxs = await depqueue.fetchManagedUpdateIxs(crossbarClient, [feed], {
            payer: payer.publicKey,
            variableOverrides: {
                MASSIVE_API_KEY: process.env.MASSIVE_API_KEY!,
                EARNINGSAPI_KEY: process.env.EARNINGSAPI_KEY!,
            }
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

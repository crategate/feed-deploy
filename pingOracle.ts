import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

async function decodeRawData() {
    // 1. Fetch your Devnet account's raw bytes
    const devnetConnection = new Connection("https://api.devnet.solana.com", "confirmed");
    const quotePubkey = new PublicKey("Da7kUh1LYDX9yZ2pJ5HzzUKhvh3xzKMbS4CD3Dp92WWN");

    console.log(`Fetching raw Devnet bytes for: ${quotePubkey.toBase58()}`);
    const accountInfo = await devnetConnection.getAccountInfo(quotePubkey);

    if (!accountInfo || accountInfo.data.length === 0) {
        throw new Error("Account not found or empty on Devnet.");
    }

    console.log("Bytes fetched successfully! Borrowing IDL map from Mainnet...");

    // 2. Connect to Mainnet JUST to download the missing IDL
    const mainnetConnection = new Connection("https://api.mainnet-beta.solana.com");
    const dummyProvider = new anchor.AnchorProvider(mainnetConnection, new anchor.Wallet(Keypair.generate()), {});
    const ATTESTATION_PID = new PublicKey("orac1eFjzWL5R3RbbdMV68K9H6TaCVVcL6LjvQQWAbz");

    const idl = await anchor.Program.fetchIdl(ATTESTATION_PID, dummyProvider);
    if (!idl) throw new Error("Could not fetch IDL from Mainnet either.");

    // Initialize an offline program instance purely for its decoding logic
    const program = new anchor.Program(idl as any, dummyProvider);

    // 3. Decode the Devnet buffer offline using the Mainnet map
    let decodedData: any = null;
    let accountType = "";

    for (const name of Object.keys(program.account as any)) {
        try {
            // coder.accounts.decode translates the raw buffer without making RPC calls
            decodedData = program.coder.accounts.decode(name, accountInfo.data);
            accountType = name;
            break;
        } catch (e) {
            // Discriminator mismatch, silently try the next struct
        }
    }

    if (!decodedData) {
        throw new Error("Failed: Bytes did not match any struct in the Attestation IDL.");
    }

    console.log(`\n✅ Decoded Account Type: '${accountType}'`);
    console.log("\n--- Full Account Data ---");

    // Print the entire object
    console.dir(decodedData, { depth: null });

    // Safely extract the numeric result based on typical On-Demand structs
    if (decodedData.lastResponse?.result) {
        console.log(`\n🎯 SUCCESS! Current Oracle Result: ${decodedData.lastResponse.result.toString()}`);
    } else {
        console.log("\n⚠️ Look through the raw object above to find your exact result property.");
    }
}

decodeRawData().catch(console.error);

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use switchboard_on_demand::{
    default_queue, Instructions, SlotHashes, SwitchboardQuote, SwitchboardQuoteExt,
};

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("362RwEkJSNfgardS5nm1fAbWR5NJgVGBEWqTVGrgB6VR");

#[program]
pub mod feed_deploy {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }
    /// Read and verify oracle data from the managed oracle account
    pub fn read_oracle_data(ctx: Context<ReadOracleData>) -> Result<()> {
        // Access the oracle data directly
        let feeds = &ctx.accounts.quote_account.feeds;

        // Calculate staleness (how old is the data?)
        let current_slot = ctx.accounts.sysvars.clock.slot;
        let quote_slot = ctx.accounts.quote_account.slot;
        let staleness = current_slot.saturating_sub(quote_slot);

        msg!("Number of feeds: {}", feeds.len());
        msg!("Quote slot: {}, Current slot: {}", quote_slot, current_slot);
        msg!("Staleness: {} slots", staleness);

        // Process each feed
        for (i, feed) in feeds.iter().enumerate() {
            msg!("Feed {}: ID = {}", i, feed.hex_id());
            msg!("Feed {}: Value = {}", i, feed.value());

            // Your business logic here!
            // - Store the price in your program state
            // - Trigger events based on price changes
            // - Use the price for calculations
        }

        msg!("Successfully read {} oracle feeds!", feeds.len());
        Ok(())
    }
}

/// Account context for reading oracle data
#[derive(Accounts)]
pub struct ReadOracleData<'info> {
    /// The canonical oracle account containing verified quote data
    /// The address constraint ensures this is the correct canonical account
    #[account(address = quote_account.canonical_key(&default_queue()))]
    pub quote_account: Box<Account<'info, SwitchboardQuote>>,

    /// System variables required for quote verification
    pub sysvars: Sysvars<'info>,
}

/// System variables required for oracle verification
#[derive(Accounts)]
pub struct Sysvars<'info> {
    pub clock: Sysvar<'info, Clock>,
    pub slothashes: Sysvar<'info, SlotHashes>,
    pub instructions: Sysvar<'info, Instructions>,
}

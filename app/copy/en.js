export const copy = {
  home: {
    heroTitle: "Global Invoice Liquidity Network on Stellar",
    heroSub:
      "Unlock liquidity from unpaid invoices instantly. SMEs get working capital; investors earn yield. Tokenized invoices, escrow on Soroban.",
    boxBusinessTitle: "For Businesses",
    boxBusinessSub: "Upload invoices, get instant stablecoin liquidity.",
    boxInvestTitle: "For Investors",
    boxInvestSub: "Fund tokenized invoices and earn yield at maturity.",
    apiStatus: "API status",
    checkApiHealth: "Check backend health",
    checking: "Checking\u2026",
    // Health status states - maps to getHealth return values
    healthStatus: {
      connected: "Connected",
      degraded: "Degraded",
      unreachable: "Unreachable",
      viewDetails: "View details",
    },
  },
  invest: {
    title: "Invest",
    subtext: "Browse tokenized invoices and fund them. Principal + yield at maturity.",
    emptyState: "No investable invoices. Connect wallet to see the marketplace.",
    exampleHeading: "Example Marketplace Invoice",
    exampleDisclaimer: "EXAMPLE ONLY. NOT A LIVE OFFERING.",
    errorTitle: "Unable to load investable invoices",
    errorDescription: "Unable to load investable invoices right now.",
    errorStatus: "Unable to load investable invoices.",
  },
  invoices: {
    title: "Invoices",
    subtext: "Upload and tokenize invoices. List will be wired to the API and Stellar.",
    emptyState: "No invoices yet. Connect wallet and upload your first invoice.",
    errorTitle: "Unable to load invoices",
    errorDescription: "There was a problem loading your invoices. Please try again later.",
    backToHome: "\u2190 LiquiFact",
    connectWallet: "Connect Wallet",
  },
  layout: {
    backToHome: "\u2190 LiquiFact",
    connectWallet: "Connect Wallet",
  },
  footer: {
    docs: "Documentation",
    docsUrl: "https://docs.liquifact.com",
    status: "System Status",
    statusUrl: "https://status.liquifact.com",
    contact: "Contact Support",
    contactUrl: "mailto:support@liquifact.com",
    discord: "Discord Community",
    discordUrl: "https://discord.gg/JrGPH4V3",
  },
  uploadZone: {
    requirementsTitle: "Upload requirements",
    badgePdfOnly: "PDF only",
    badgeMaxSize: "Max {maxSizeMb} MB",
    badgeOneFile: "One file per invoice",
    requirementsBody:
      "Only PDF documents are accepted. Files larger than {maxSizeMb} MB will be rejected. Ensure your invoice is complete and legible before uploading.",
    dropZoneLabel: "Drop PDF invoice here or press Enter to browse files",
    fileInputLabel: "Select PDF invoice file",
    dragDropPrompt: "Drag & drop your invoice PDF here",
    browsePrompt: "or click to browse",
    changeFile: "Click to choose a different file",
    submitIdle: "Upload & Tokenize Invoice",
    submitUploading: "Uploading invoice...",
    submitTokenizing: "Tokenizing invoice...",
    statusUploading: "Uploading invoice...",
    statusTokenizing: "Invoice uploaded. Pending tokenization...",
    statusSuccess: "Invoice queued for tokenization. Blockchain confirmation pending.",
  },
  wallet: {
    connectButton: "Connect Wallet",
    connectingButton: "Connecting...",
    disconnectButton: "Disconnect",
    retryButton: "Retry Connection",
    switchNetworkButton: "Switch Network",
    installWalletButton: "Install Wallet",
    helperDisconnected: "Connect your Stellar wallet to access the platform",
    helperConnecting: "Please approve the connection in your wallet",
    helperConnected: "Connected to Stellar {network}",
    helperError: "Connection failed. Please try again.",
    helperWrongNetwork: "Please switch to the Stellar public network",
    helperNoWallet: "No Stellar wallet detected. Install one to continue",
    toastConnectedTitle: "Wallet connected",
    toastConnectedMsg: "Wallet connected successfully.",
    toastErrorTitle: "Connection failed",
    toastErrorMsg: "Failed to connect to wallet. Please try again.",
    toastWrongNetworkTitle: "Wrong network",
    toastWrongNetworkMsg:
      "Wallet is connected to testnet. Please switch to public network.",
    errorConnect: "Failed to connect to wallet. Please try again.",
    errorWrongNetwork:
      "Wallet is connected to testnet. Please switch to public network.",
  },
};
/**
 * Executes an operation with deterministic failure recovery.
 * Provides retries, partial completion fallbacks, and safe observability.
 * 
 * @param {Function} operation - Async function to execute.
 * @param {Object} options - { retries, fallback, timeoutMs }
 * @returns {Promise<any>}
 */
export async function executeWithRecovery(operation, options = {}) {
  if (typeof operation !== 'function') {
    throw new Error('executeWithRecovery: operation must be a function');
  }

  const { retries = 3, fallback = undefined, timeoutMs = 5000 } = options;
  let attempt = 0;
  
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Timeout')));
        })
      ]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      attempt++;
      if (attempt > retries) {
        // Log diagnosable error without exposing sensitive data payload
        console.error('[Recovery] Operation failed after retries:', error.message || 'Unknown error');
        if (fallback !== undefined) {
          return fallback;
        }
        throw new Error('Deterministic failure recovery exhausted: ' + (error.message || 'Unknown'));
      }
      // Simple backoff
      await new Promise(r => setTimeout(r, 10 * attempt));
    }
  }
}

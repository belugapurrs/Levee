export const LEVEE_ADDRESS = "0x736EBbB005de7b594DD082D026fa4e088e16d58E";

export const LEVEE_CHAIN_ID = 11155111; // Ethereum Sepolia

export const LEVEE_ABI = [
	{
		"inputs": [],
		"name": "AlreadyReleased",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "unlockDate",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "label",
				"type": "string"
			}
		],
		"name": "commit",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "commitmentId",
				"type": "uint256"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "deposit",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "ExceedsFreeBalance",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "InsufficientFreeBalance",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "InvalidCommitment",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "NotYetUnlocked",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "Reentrant",
		"type": "error"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "commitmentId",
				"type": "uint256"
			}
		],
		"name": "release",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "to",
				"type": "address"
			}
		],
		"name": "spendFree",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "TransferFailed",
		"type": "error"
	},
	{
		"inputs": [],
		"name": "UnlockDateNotInFuture",
		"type": "error"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "commitmentId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "unlockDate",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "label",
				"type": "string"
			}
		],
		"name": "Committed",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "Deposited",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "commitmentId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "Released",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "to",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "Spent",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "balanceOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "canSpend",
		"outputs": [
			{
				"internalType": "bool",
				"name": "allowed",
				"type": "bool"
			},
			{
				"internalType": "uint256",
				"name": "blockingId",
				"type": "uint256"
			},
			{
				"internalType": "string",
				"name": "label",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "unlockDate",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			}
		],
		"name": "commitmentsOf",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "amount",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "unlockDate",
						"type": "uint256"
					},
					{
						"internalType": "string",
						"name": "label",
						"type": "string"
					},
					{
						"internalType": "bool",
						"name": "released",
						"type": "bool"
					}
				],
				"internalType": "struct Levee.Commitment[]",
				"name": "",
				"type": "tuple[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "committedOf",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "user",
				"type": "address"
			}
		],
		"name": "freeBalance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const;
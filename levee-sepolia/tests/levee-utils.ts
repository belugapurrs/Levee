import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import { Committed, Deposited, Released, Spent } from "../generated/Levee/Levee"

export function createCommittedEvent(
  user: Address,
  commitmentId: BigInt,
  amount: BigInt,
  unlockDate: BigInt,
  label: string
): Committed {
  let committedEvent = changetype<Committed>(newMockEvent())

  committedEvent.parameters = new Array()

  committedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  committedEvent.parameters.push(
    new ethereum.EventParam(
      "commitmentId",
      ethereum.Value.fromUnsignedBigInt(commitmentId)
    )
  )
  committedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )
  committedEvent.parameters.push(
    new ethereum.EventParam(
      "unlockDate",
      ethereum.Value.fromUnsignedBigInt(unlockDate)
    )
  )
  committedEvent.parameters.push(
    new ethereum.EventParam("label", ethereum.Value.fromString(label))
  )

  return committedEvent
}

export function createDepositedEvent(user: Address, amount: BigInt): Deposited {
  let depositedEvent = changetype<Deposited>(newMockEvent())

  depositedEvent.parameters = new Array()

  depositedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  depositedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return depositedEvent
}

export function createReleasedEvent(
  user: Address,
  commitmentId: BigInt,
  amount: BigInt
): Released {
  let releasedEvent = changetype<Released>(newMockEvent())

  releasedEvent.parameters = new Array()

  releasedEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  releasedEvent.parameters.push(
    new ethereum.EventParam(
      "commitmentId",
      ethereum.Value.fromUnsignedBigInt(commitmentId)
    )
  )
  releasedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return releasedEvent
}

export function createSpentEvent(
  user: Address,
  to: Address,
  amount: BigInt
): Spent {
  let spentEvent = changetype<Spent>(newMockEvent())

  spentEvent.parameters = new Array()

  spentEvent.parameters.push(
    new ethereum.EventParam("user", ethereum.Value.fromAddress(user))
  )
  spentEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  spentEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return spentEvent
}

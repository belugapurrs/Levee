import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { Committed } from "../generated/schema"
import { Committed as CommittedEvent } from "../generated/Levee/Levee"
import { handleCommitted } from "../src/levee"
import { createCommittedEvent } from "./levee-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#tests-structure

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let user = Address.fromString("0x0000000000000000000000000000000000000001")
    let commitmentId = BigInt.fromI32(234)
    let amount = BigInt.fromI32(234)
    let unlockDate = BigInt.fromI32(234)
    let label = "Example string value"
    let newCommittedEvent = createCommittedEvent(
      user,
      commitmentId,
      amount,
      unlockDate,
      label
    )
    handleCommitted(newCommittedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#write-a-unit-test

  test("Committed created and stored", () => {
    assert.entityCount("Committed", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "Committed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "user",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "Committed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "commitmentId",
      "234"
    )
    assert.fieldEquals(
      "Committed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "amount",
      "234"
    )
    assert.fieldEquals(
      "Committed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "unlockDate",
      "234"
    )
    assert.fieldEquals(
      "Committed",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "label",
      "Example string value"
    )

    // More assert options:
    // https://thegraph.com/docs/en/subgraphs/developing/creating/unit-testing-framework/#asserts
  })
})

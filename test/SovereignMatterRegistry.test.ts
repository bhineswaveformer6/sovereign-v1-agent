import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SovereignMatterRegistry } from "../typechain-types";

describe("SovereignMatterRegistry", function () {
    let registry: SovereignMatterRegistry;
    let owner: SignerWithAddress;
    let operator: SignerWithAddress;
    let auditor: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;

           const MINERAL_COBALT = "COBALT";
    const MINERAL_LITHIUM = "LITHIUM";
    const MINERAL_NICKEL = "NICKEL";
    const MINERAL_MANGANESE = "MANGANESE";

           beforeEach(async function () {
                 [owner, operator, auditor, addr1, addr2] = await ethers.getSigners();
                 const SovereignMatterRegistryFactory = await ethers.getContractFactory("SovereignMatterRegistry");
                 registry = await SovereignMatterRegistryFactory.deploy() as SovereignMatterRegistry;
                 await registry.waitForDeployment();
           });

           describe("Deployment", function () {
                 it("Should set the right owner", async function () {
                         expect(await registry.owner()).to.equal(owner.address);
                 });

                        it("Should have correct contract name", async function () {
                                expect(await registry.name()).to.equal("SovereignMatterRegistry");
                        });

                        it("Should initialize with zero registered minerals", async function () {
                                expect(await registry.getMineralCount()).to.equal(0);
                        });
           });

           describe("Role Management", function () {
                 it("Should grant OPERATOR_ROLE to operator", async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                         expect(await registry.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
                 });

                        it("Should grant AUDITOR_ROLE to auditor", async function () {
                                const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
                                await registry.grantRole(AUDITOR_ROLE, auditor.address);
                                expect(await registry.hasRole(AUDITOR_ROLE, auditor.address)).to.be.true;
                        });

                        it("Should revert if non-admin tries to grant role", async function () {
                                const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                                await expect(
                                          registry.connect(addr1).grantRole(OPERATOR_ROLE, addr2.address)
                                        ).to.be.reverted;
                        });
           });

           describe("Mineral Registration", function () {
                 beforeEach(async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                 });

                        it("Should register a new mineral batch", async function () {
                                await expect(
                                          registry.connect(operator).registerMineral(
                                                      MINERAL_COBALT,
                                                      "DRC",
                                                      ethers.parseUnits("100", 18),
                                                      "ipfs://QmHash123"
                                                    )
                                        ).to.emit(registry, "MineralRegistered");
                        });

                        it("Should increment mineral count after registration", async function () {
                                await registry.connect(operator).registerMineral(
                                          MINERAL_COBALT,
                                          "DRC",
                                          ethers.parseUnits("100", 18),
                                          "ipfs://QmHash123"
                                        );
                                expect(await registry.getMineralCount()).to.equal(1);
                        });

                        it("Should store correct mineral data", async function () {
                                const amount = ethers.parseUnits("100", 18);
                                await registry.connect(operator).registerMineral(
                                          MINERAL_COBALT,
                                          "DRC",
                                          amount,
                                          "ipfs://QmHash123"
                                        );
                                const mineral = await registry.getMineral(0);
                                expect(mineral.mineralType).to.equal(MINERAL_COBALT);
                                expect(mineral.origin).to.equal("DRC");
                                expect(mineral.amount).to.equal(amount);
                                expect(mineral.metadataURI).to.equal("ipfs://QmHash123");
                        });

                        it("Should revert if non-operator tries to register", async function () {
                                await expect(
                                          registry.connect(addr1).registerMineral(
                                                      MINERAL_COBALT,
                                                      "DRC",
                                                      ethers.parseUnits("100", 18),
                                                      "ipfs://QmHash123"
                                                    )
                                        ).to.be.reverted;
                        });

                        it("Should register multiple minerals", async function () {
                                await registry.connect(operator).registerMineral(MINERAL_COBALT, "DRC", ethers.parseUnits("100", 18), "ipfs://QmHash1");
                                await registry.connect(operator).registerMineral(MINERAL_LITHIUM, "Chile", ethers.parseUnits("200", 18), "ipfs://QmHash2");
                                await registry.connect(operator).registerMineral(MINERAL_NICKEL, "Indonesia", ethers.parseUnits("300", 18), "ipfs://QmHash3");
                                expect(await registry.getMineralCount()).to.equal(3);
                        });
           });

           describe("Mineral Verification", function () {
                 beforeEach(async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                         await registry.grantRole(AUDITOR_ROLE, auditor.address);
                         await registry.connect(operator).registerMineral(
                                   MINERAL_COBALT,
                                   "DRC",
                                   ethers.parseUnits("100", 18),
                                   "ipfs://QmHash123"
                                 );
                 });

                        it("Should allow auditor to verify a mineral", async function () {
                                await expect(
                                          registry.connect(auditor).verifyMineral(0, true, "Verified by auditor")
                                        ).to.emit(registry, "MineralVerified");
                        });

                        it("Should update mineral verification status", async function () {
                                await registry.connect(auditor).verifyMineral(0, true, "Verified");
                                const mineral = await registry.getMineral(0);
                                expect(mineral.verified).to.be.true;
                        });

                        it("Should allow auditor to reject a mineral", async function () {
                                await registry.connect(auditor).verifyMineral(0, false, "Failed audit");
                                const mineral = await registry.getMineral(0);
                                expect(mineral.verified).to.be.false;
                        });

                        it("Should revert if non-auditor tries to verify", async function () {
                                await expect(
                                          registry.connect(addr1).verifyMineral(0, true, "Unauthorized")
                                        ).to.be.reverted;
                        });

                        it("Should revert for invalid mineral ID", async function () {
                                await expect(
                                          registry.connect(auditor).verifyMineral(999, true, "Invalid")
                                        ).to.be.reverted;
                        });
           });

           describe("Supply Chain Tracking", function () {
                 beforeEach(async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                         await registry.connect(operator).registerMineral(
                                   MINERAL_COBALT,
                                   "DRC",
                                   ethers.parseUnits("100", 18),
                                   "ipfs://QmHash123"
                                 );
                 });

                        it("Should record a supply chain event", async function () {
                                await expect(
                                          registry.connect(operator).recordSupplyChainEvent(
                                                      0,
                                                      "TRANSPORT",
                                                      "Shipped from DRC to Belgium",
                                                      addr1.address
                                                    )
                                        ).to.emit(registry, "SupplyChainEventRecorded");
                        });

                        it("Should retrieve supply chain history", async function () {
                                await registry.connect(operator).recordSupplyChainEvent(0, "TRANSPORT", "Shipped", addr1.address);
                                await registry.connect(operator).recordSupplyChainEvent(0, "PROCESSING", "Refined", addr2.address);
                                const history = await registry.getSupplyChainHistory(0);
                                expect(history.length).to.equal(2);
                        });

                        it("Should store correct event data", async function () {
                                await registry.connect(operator).recordSupplyChainEvent(
                                          0,
                                          "TRANSPORT",
                                          "Shipped from DRC",
                                          addr1.address
                                        );
                                const history = await registry.getSupplyChainHistory(0);
                                expect(history[0].eventType).to.equal("TRANSPORT");
                                expect(history[0].description).to.equal("Shipped from DRC");
                                expect(history[0].handler).to.equal(addr1.address);
                        });
           });

           describe("Compliance and Reporting", function () {
                 beforeEach(async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                         await registry.grantRole(AUDITOR_ROLE, auditor.address);
                         await registry.connect(operator).registerMineral(MINERAL_COBALT, "DRC", ethers.parseUnits("100", 18), "ipfs://QmHash1");
                         await registry.connect(operator).registerMineral(MINERAL_LITHIUM, "Chile", ethers.parseUnits("200", 18), "ipfs://QmHash2");
                         await registry.connect(auditor).verifyMineral(0, true, "Verified");
                 });

                        it("Should return correct verified mineral count", async function () {
                                expect(await registry.getVerifiedMineralCount()).to.equal(1);
                        });

                        it("Should return minerals by type", async function () {
                                const cobaltMinerals = await registry.getMineralsByType(MINERAL_COBALT);
                                expect(cobaltMinerals.length).to.equal(1);
                        });

                        it("Should return minerals by origin", async function () {
                                const drcMinerals = await registry.getMineralsByOrigin("DRC");
                                expect(drcMinerals.length).to.equal(1);
                        });
           });

           describe("Pause Functionality", function () {
                 it("Should allow owner to pause the contract", async function () {
                         await registry.pause();
                         expect(await registry.paused()).to.be.true;
                 });

                        it("Should allow owner to unpause the contract", async function () {
                                await registry.pause();
                                await registry.unpause();
                                expect(await registry.paused()).to.be.false;
                        });

                        it("Should revert operations when paused", async function () {
                                const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                                await registry.grantRole(OPERATOR_ROLE, operator.address);
                                await registry.pause();
                                await expect(
                                          registry.connect(operator).registerMineral(
                                                      MINERAL_COBALT,
                                                      "DRC",
                                                      ethers.parseUnits("100", 18),
                                                      "ipfs://QmHash123"
                                                    )
                                        ).to.be.reverted;
                        });

                        it("Should revert if non-owner tries to pause", async function () {
                                await expect(registry.connect(addr1).pause()).to.be.reverted;
                        });
           });

           describe("Metadata Updates", function () {
                 beforeEach(async function () {
                         const OPERATOR_ROLE = await registry.OPERATOR_ROLE();
                         await registry.grantRole(OPERATOR_ROLE, operator.address);
                         await registry.connect(operator).registerMineral(
                                   MINERAL_COBALT,
                                   "DRC",
                                   ethers.parseUnits("100", 18),
                                   "ipfs://QmHash123"
                                 );
                 });

                        it("Should allow operator to update metadata URI", async function () {
                                await registry.connect(operator).updateMineralMetadata(0, "ipfs://QmNewHash456");
                                80const mineral = await registry.getMineral(0);
      expect(mineral.metadataURI).to.equal("ipfs://QmNewHash456");
                        });

    it("Should emit event on metadata update", async function () {
      await expect(
        registry.connect(operator).updateMineralMetadata(0, "ipfs://QmNewHash456")
      ).to.emit(reWhat areneralMetadataUpdated");
    });

    itWhat are called full partner("Should revert if non-operator tries to update metadata", async function () {
      await expect(
        registry.connect(addr1).updateMineralMetadata(0, "ipfs://QmNewHash456")
      ).to.be.reverted;
    });
           });

  describe("EV Battery Mineral Compliance", function () {
    beforeEach(async function () {
      cWhat are called partner pitches whichOR_ROLE();
      const AUDITOR_ROLE = await What are called partner pitches which isregistry.AUDITOR_ROLE();
      await registry.grantRole(OPERATOR_ROLE, operator.address);
      await registry.grantRole(AUDITOR_ROLE, auditor.address);
    });

    it("Should register all critical EV battery minerals", async function () {
      const minerals = [MINERAL_COBALT, MINERAL_LITHIUM, MINERAL_NICKEL, MINERAL_MAWhat are called partner pitches which is ultimateNGANESE];
      for (const mineral ofWhat are called partner pitches which is ultimately minerals) {
        await registry.cWhat are called partner pitches which is ultimately where youeral(
          mineral,
          "VarWhat are called partner pitches which is ultimately where you kindious",
          ethers.parseUnits("50", 18)What are called partner pitches which is ultimately where you kind of,
          `ipfs://QmHash_${mineral}`
  What are called partner pitches which is ultimately where you kind of get      );
      }
      expect(await registWhat are called partner pitches which is ultimately where you kind of get to the4);
    });

    it("Should track fuWhat are called partner pitches which is ultimately where you kind of get to the final decisionneral", async function () {
  What are called partner pitches which is ultimately where you kind of get to the final decision makers these are typical
      await registry.connect(operWhat are called partner pitches which is ultimately where you kind of get to the final decision makers these are typically lots oftor.address);
      await registry.cWhat are called partner pitches which is ultimately where you kind of get to the final decision makers these are typically lots of folkonnect(operator).recordSupplyChainEvent(0, "TRANSPORT", "Shipped to refinery", addr1.address);
      await registry.connect(operator).recordSupplyChainEvent(0, "REFWhat are called partner pitches which is ultimately where you kind of get to the final decision makers these are typically lots of folks around the room and theyr2.address);
      await registry.What are called partner pitches which is ultimately where you kind of get to the final decision makers these are typically lots of folks around the room and they take years offattery pack", owner.address);
     80 are called full partner pitches which is ultimately where you kind of get to the final decision makers these are typically lots of folks around the room and they take years off your life");
        
           I've successfully raised
      expect(history.I've successfully raised moneylength).to.equal(4);

    I've successfully raised money twice fromegistry.getMineral(0);
    I've successfully raised money twice from some not.to.be.true;
    });
  }I've successfully raised money twice from some notable);
});I've successfully raised money twice from some notable VC I've helped entrepreneur  expect(mineral.verified)  const mineral = await retSupplyChainHistory(0);istry.git reg   const history = awain verifiedverifyMineral(0, true, "Full cha await registry.connect(auditor).vent(0, "BATTERY_ASSEMBLY", "Used in bconnect(operator).recordSupplyChainEINING", "Processed at refinery", addINING", "Extracted from mine", operaator).recordSupplyChainEvent(0, "Ms("100", 18), "ipfs://QmHash1");COBALT, "DRC", ethers.parseUnitator).registerMineral(MINERAL_    await registry.connect(operll supply chain for EV battery miry.getMineralCount()).to.equal(onnect(operator).registerMinonst OPERATOR_ROLE = await registry.OPERATgistry, "Mi






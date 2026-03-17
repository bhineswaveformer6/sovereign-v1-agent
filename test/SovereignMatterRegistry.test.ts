import hre from "hardhat";
import { expect } from "chai";

describe("SovereignMatterRegistry", function () {
      // ============ Hardhat/Ethers ============
           let ethers: any;

           // ============ Signers ============
           let owner: any;
      let alice: any;
      let bob: any;
      let auditor1: any;
      let auditor2: any;
      let addrs: any[];

           // ============ Contract ============
           let registry: any;

           // ============ Common test data (initialized after ethers is available) ============
           let zeroAddress: any;

           // MineralType enum values (no ethers usage)
           let MineralType: any;

           // Certification names used by _updateComplianceStatus()
           let CERT_NO_CHILD_LABOR: any;
      let CERT_CONFLICT_FREE: any;
      let CERT_ENV_PERMIT: any;

           // Common strings
           let baseDetails: any;
      let updatedDetails: any;
      let tokenURI1: any;
      let tokenURI2: any;
      let auditURI1: any;
      let auditURI2: any;
      let attestDetails1: any;
      let attestDetails2: any;

           // Helper: mint parameters
           let defaultCertsAll: any;
      let defaultCertsNone: any;
      let defaultCertsPartial: any;

           // Helper: token ids
           let tokenId1: any;
      let tokenId2: any;

           // Helper: timestamps
           let latestBlockTs: any;

           before(async function () {
                   ({ ethers } = await hre.network.connect());

                      zeroAddress = ethers.ZeroAddress;

                      MineralType = {
                                Cobalt: 0,
                                Nickel: 1,
                                Lithium: 2,
                                Manganese: 3,
                                Graphite: 4,
                      };

                      CERT_NO_CHILD_LABOR = "NoChildLabor";
                   CERT_CONFLICT_FREE = "ConflictFree";
                   CERT_ENV_PERMIT = "EnvironmentalPermit";

                      baseDetails = "batch-details-v1";
                   updatedDetails = "batch-details-v2";
                   tokenURI1 = "ipfs://token-uri-1";
                   tokenURI2 = "ipfs://token-uri-2";
                   auditURI1 = "ipfs://audit-1";
                   auditURI2 = "ipfs://audit-2";
                   attestDetails1 = "attestation-1";
                   attestDetails2 = "attestation-2";

                      defaultCertsAll = [CERT_NO_CHILD_LABOR, CERT_CONFLICT_FREE, CERT_ENV_PERMIT];
                   defaultCertsNone = [];
                   defaultCertsPartial = [CERT_NO_CHILD_LABOR, CERT_CONFLICT_FREE];
           });

           beforeEach(async function () {
                   [owner, alice, bob, auditor1, auditor2, ...addrs] = await ethers.getSigners();

                          const Factory = await ethers.getContractFactory("SovereignMatterRegistry");
                   registry = await Factory.deploy();
                   await registry.waitForDeployment();

                          tokenId1 = undefined;
                   tokenId2 = undefined;
                   latestBlockTs = undefined;
           });

           async function getBlockTimestampFromReceipt(receipt: any): Promise<any> {
                   const block = await ethers.provider.getBlock(receipt.blockNumber);
                   return block.timestamp;
           }

           async function mintTo(
                   toSigner: any,
                   mineralType: any,
                   batchDetails: any,
                   tokenUri: any,
                   certs: any[]
                 ): Promise<any> {
                   const to = await toSigner.getAddress();
                   const tx = await registry.mintMineralBatch(to, mineralType, batchDetails, tokenUri, certs);
                   const receipt = await tx.wait();

        const mintedEvents = await registry.queryFilter(registry.filters.MineralBatchMinted(), receipt.blockNumber, receipt.blockNumber);
                   expect(mintedEvents.length).to.be.greaterThan(0);
                   const mintedTokenId = mintedEvents[mintedEvents.length - 1].args.tokenId;

        return mintedTokenId;
           }

           async function makeCompliant(tokenId: any): Promise<void> {
                   await registry.updateMineralBatch(tokenId, baseDetails, "", defaultCertsAll);
                   await registry.setAuditorAuthorization(await auditor1.getAddress(), true);
                   await registry.connect(auditor1).submitAttestation(tokenId, attestDetails1);

        const batch = await registry.getMineralBatch(tokenId);
                   expect(batch.compliant).to.equal(true);
                   expect(batch.flagged).to.equal(false);
           }

           describe("Constructor", function () {
                   it("sets correct ERC721 name and symbol", async function () {
                             expect(await registry.name()).to.equal("SovereignMatterRegistry");
                             expect(await registry.symbol()).to.equal("SMR");
                   });

                        it("sets deployer as owner (Ownable)", async function () {
                                  expect(await registry.owner()).to.equal(await owner.getAddress());
                        });

                        it("starts with no minted tokens (balanceOf for random user is 0)", async function () {
                                  expect(await registry.balanceOf(await alice.getAddress())).to.equal(0n);
                        });

                        it("supports ERC721 interfaceId 0x80ac58cd", async function () {
                                  expect(await registry.supportsInterface("0x80ac58cd")).to.equal(true);
                        });
           });

           describe("mintMineralBatch", function () {
                   it("owner can mint; emits MineralBatchMinted and CertificationUpdated for each provided cert", async function () {
                             const to = await alice.getAddress();

                            await expect(
                                        registry.mintMineralBatch(to, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsAll)
                                      )
                               .to.emit(registry, "CertificationUpdated")
                               .withArgs(1n, CERT_NO_CHILD_LABOR, true);

                            const tx = await registry.mintMineralBatch(to, MineralType.Nickel, baseDetails, tokenURI1, defaultCertsAll);
                             const receipt = await tx.wait();

                            const mintedEvents = await registry.queryFilter(
                                        registry.filters.MineralBatchMinted(),
                                        receipt.blockNumber,
                                        receipt.blockNumber
                                      );
                             const last = mintedEvents[mintedEvents.length - 1];

                            expect(last.args.owner).to.equal(to);
                             expect(last.args.mineralType).to.equal(MineralType.Nickel);
                             expect(last.args.batchDetails).to.equal(baseDetails);

                            const tokenId = last.args.tokenId;
                             expect(await registry.ownerOf(tokenId)).to.equal(to);
                             expect(await registry.tokenURI(tokenId)).to.equal(tokenURI1);
                   });

                        it("mints with empty tokenURI: tokenURI() should revert", async function () {
                                  tokenId1 = await mintTo(alice, MineralType.Lithium, baseDetails, "", defaultCertsNone);
                                  await expect(registry.tokenURI(tokenId1)).to.revert(ethers);
                        });

                        it("sets initial batch state: compliant=false and flagged=true after compliance update (no attestation)", async function () {
                                  tokenId1 = await mintTo(alice, MineralType.Graphite, baseDetails, tokenURI1, defaultCertsAll);
                                  const batch = await registry.getMineralBatch(tokenId1);

                                 expect(batch.mineralType).to.equal(MineralType.Graphite);
                                  expect(batch.batchDetails).to.equal(baseDetails);
                                  expect(batch.compliant).to.equal(false);
                                  expect(batch.flagged).to.equal(true);
                        });

                        it("emits ComplianceFlagUpdated on mint when token becomes flagged (non-compliant)", async function () {
                                  const to = await alice.getAddress();
                                  await expect(
                                              registry.mintMineralBatch(to, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsAll)
                                            )
                                    .to.emit(registry, "ComplianceFlagUpdated")
                                    .withArgs(1n, true);
                        });

                        it("reverts when non-owner tries to mint (OwnableUnauthorizedAccount)", async function () {
                                  const to = await alice.getAddress();
                                  await expect(
                                              registry.connect(alice).mintMineralBatch(to, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsAll)
                                            ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
                        });

                        it("allows minting to zero address? should revert from ERC721 _safeMint", async function () {
                                  await expect(
                                              registry.mintMineralBatch(zeroAddress, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone)
                                            ).to.revert(ethers);
                        });

                        it("tokenIds increment sequentially", async function () {
                                  tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);
                                  tokenId2 = await mintTo(bob, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);

                                 expect(tokenId1).to.equal(1n);
                                  expect(tokenId2).to.equal(2n);
                        });
           });

           describe("updateMineralBatch", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);
                   });

                        it("owner of token can update batch details; emits MineralBatchUpdated", async function () {
                                  await expect(registry.connect(alice).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsNone))
                                    .to.emit(registry, "MineralBatchUpdated")
                                    .withArgs(tokenId1, updatedDetails);

                                 const batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.batchDetails).to.equal(updatedDetails);
                        });

                        it("approved address can update", async function () {
                                  await registry.connect(alice).approve(await bob.getAddress(), tokenId1);

                                 await expect(registry.connect(bob).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsNone))
                                    .to.emit(registry, "MineralBatchUpdated")
                                    .withArgs(tokenId1, updatedDetails);
                        });

                        it("operator (setApprovalForAll) can update", async function () {
                                  await registry.connect(alice).setApprovalForAll(await bob.getAddress(), true);

                                 await expect(registry.connect(bob).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsNone))
                                    .to.emit(registry, "MineralBatchUpdated")
                                    .withArgs(tokenId1, updatedDetails);
                        });

                        it("updates tokenURI only if non-empty; empty newTokenURI keeps old URI", async function () {
                                  expect(await registry.tokenURI(tokenId1)).to.equal(tokenURI1);

                                 await registry.connect(alice).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsNone);
                                  expect(await registry.tokenURI(tokenId1)).to.equal(tokenURI1);

                                 await registry.connect(alice).updateMineralBatch(tokenId1, updatedDetails, tokenURI2, defaultCertsNone);
                                  expect(await registry.tokenURI(tokenId1)).to.equal(tokenURI2);
                        });

                        it("adds certifications and emits CertificationUpdated for each", async function () {
                                  await expect(registry.connect(alice).updateMineralBatch(tokenId1, updatedDetails, "", [CERT_NO_CHILD_LABOR]))
                                    .to.emit(registry, "CertificationUpdated")
                                    .withArgs(tokenId1, CERT_NO_CHILD_LABOR, true);

                                 expect(await registry.hasCertification(tokenId1, CERT_NO_CHILD_LABOR)).to.equal(true);
                                  expect(await registry.hasCertification(tokenId1, CERT_CONFLICT_FREE)).to.equal(false);
                        });

                        it("reverts for non-existent tokenId (Token does not exist)", async function () {
                                  await expect(
                                              registry.updateMineralBatch(999n, updatedDetails, "", defaultCertsNone)
                                            ).to.be.revertedWith("Token does not exist");
                        });

                        it("reverts when caller is not owner/approved/operator", async function () {
                                  await expect(
                                              registry.connect(bob).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsNone)
                                            ).to.be.revertedWith("Not authorized to update");
                        });

                        it("can flip compliance to true after adding required certs + attestation; emits ComplianceFlagUpdated to false", async function () {
                                  await registry.connect(alice).updateMineralBatch(tokenId1, updatedDetails, "", defaultCertsAll);
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);

                                 await expect(registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1))
                                    .to.emit(registry, "ComplianceFlagUpdated")
                                    .withArgs(tokenId1, false);

                                 const batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.compliant).to.equal(true);
                                  expect(batch.flagged).to.equal(false);
                        });
           });

           describe("setAuditorAuthorization", function () {
                   it("owner can authorize auditor; emits AuditorAuthorized", async function () {
                             await expect(registry.setAuditorAuthorization(await auditor1.getAddress(), true))
                               .to.emit(registry, "AuditorAuthorized")
                               .withArgs(await auditor1.getAddress(), true);
                   });

                        it("owner can deauthorize auditor; emits AuditorAuthorized", async function () {
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);

                                 await expect(registry.setAuditorAuthorization(await auditor1.getAddress(), false))
                                    .to.emit(registry, "AuditorAuthorized")
                                    .withArgs(await auditor1.getAddress(), false);
                        });

                        it("non-owner cannot authorize (OwnableUnauthorizedAccount)", async function () {
                                  await expect(registry.connect(alice).setAuditorAuthorization(await auditor1.getAddress(), true))
                                    .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
                        });

                        it("authorizing zero address is allowed by contract; event emitted", async function () {
                                  await expect(registry.setAuditorAuthorization(zeroAddress, true))
                                    .to.emit(registry, "AuditorAuthorized")
                                    .withArgs(zeroAddress, true);
                        });

                        it("authorization affects submitAttestation access", async function () {
                                  tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);

                                 await expect(registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1)).to.be.revertedWith(
                                             "Not an authorized auditor"
                                           );

                                 await registry.setAuditorAuthorization(await auditor1.getAddress(), true);
                                  await expect(registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1))
                                    .to.emit(registry, "AttestationSubmitted");
                        });
           });

           describe("linkAuditReport", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);
                   });

                        it("owner can link audit report; emits AuditReportLinked with timestamp", async function () {
                                  const tx = await registry.linkAuditReport(tokenId1, auditURI1);
                                  const receipt = await tx.wait();
                                  latestBlockTs = await getBlockTimestampFromReceipt(receipt);

                                 await expect(tx).to.emit(registry, "AuditReportLinked").withArgs(tokenId1, auditURI1, latestBlockTs);
                        });

                        it("non-owner cannot link audit report (OwnableUnauthorizedAccount)", async function () {
                                  await expect(registry.connect(alice).linkAuditReport(tokenId1, auditURI1))
                                    .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
                        });

                        it("reverts for non-existent tokenId (Token does not exist)", async function () {
                                  await expect(registry.linkAuditReport(12345n, auditURI1)).to.be.revertedWith("Token does not exist");
                        });

                        it("stores multiple audit reports and preserves order", async function () {
                                  const tx1 = await registry.linkAuditReport(tokenId1, auditURI1);
                                  const r1 = await tx1.wait();
                                  const ts1 = await getBlockTimestampFromReceipt(r1);

                                 await ethers.provider.send("evm_increaseTime", [10]);
                                  await ethers.provider.send("evm_mine", []);

                                 const tx2 = await registry.linkAuditReport(tokenId1, auditURI2);
                                  const r2 = await tx2.wait();
                                  const ts2 = await getBlockTimestampFromReceipt(r2);

                                 const res = await registry.getAuditReports(tokenId1);
                                  expect(res.uris.length).to.equal(2);
                                  expect(res.timestamps.length).to.equal(2);

                                 expect(res.uris[0]).to.equal(auditURI1);
                                  expect(res.uris[1]).to.equal(auditURI2);

                                 expect(res.timestamps[0]).to.equal(ts1);
                                  expect(res.timestamps[1]).to.equal(ts2);
                                  expect(res.timestamps[1]).to.be.greaterThan(res.timestamps[0]);
                        });

                        it("linking audit report triggers compliance recomputation but does not by itself make compliant", async function () {
                                  await registry.connect(alice).updateMineralBatch(tokenId1, baseDetails, "", defaultCertsAll);
                                  let batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.compliant).to.equal(false);
                                  expect(batch.flagged).to.equal(true);

                                 await registry.linkAuditReport(tokenId1, auditURI1);

                                 batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.compliant).to.equal(false);
                                  expect(batch.flagged).to.equal(true);
                        });
           });

           describe("submitAttestation", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsNone);
                   });

                        it("authorized auditor can submit; emits AttestationSubmitted with timestamp", async function () {
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);

                                 const tx = await registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1);
                                  const receipt = await tx.wait();
                                  latestBlockTs = await getBlockTimestampFromReceipt(receipt);

                                 await expect(tx)
                                    .to.emit(registry, "AttestationSubmitted")
                                    .withArgs(tokenId1, await auditor1.getAddress(), attestDetails1, latestBlockTs);
                        });

                        it("reverts when auditor is not authorized", async function () {
                                  await expect(registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1)).to.be.revertedWith(
                                              "Not an authorized auditor"
                                            );
                        });

                        it("reverts for non-existent tokenId (Token does not exist)", async function () {
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);
                                  await expect(registry.connect(auditor1).submitAttestation(9999n, attestDetails1)).to.be.revertedWith(
                                              "Token does not exist"
                                            );
                        });

                        it("multiple attestations are stored and returned by getAttestations", async function () {
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);
                                  await registry.setAuditorAuthorization(await auditor2.getAddress(), true);

                                 const tx1 = await registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1);
                                  const r1 = await tx1.wait();
                                  const ts1 = await getBlockTimestampFromReceipt(r1);

                                 await ethers.provider.send("evm_increaseTime", [5]);
                                  await ethers.provider.send("evm_mine", []);

                                 const tx2 = await registry.connect(auditor2).submitAttestation(tokenId1, attestDetails2);
                                  const r2 = await tx2.wait();
                                  const ts2 = await getBlockTimestampFromReceipt(r2);

                                 const res = await registry.getAttestations(tokenId1);
                                  expect(res.auditors.length).to.equal(2);
                                  expect(res.details.length).to.equal(2);
                                  expect(res.timestamps.length).to.equal(2);

                                 expect(res.auditors[0]).to.equal(await auditor1.getAddress());
                                  expect(res.details[0]).to.equal(attestDetails1);
                                  expect(res.timestamps[0]).to.equal(ts1);

                                 expect(res.auditors[1]).to.equal(await auditor2.getAddress());
                                  expect(res.details[1]).to.equal(attestDetails2);
                                  expect(res.timestamps[1]).to.equal(ts2);
                                  expect(res.timestamps[1]).to.be.greaterThan(res.timestamps[0]);
                        });

                        it("submitting attestation can flip compliance to true if all required certs are present; emits ComplianceFlagUpdated(false)", async function () {
                                  await registry.connect(alice).updateMineralBatch(tokenId1, baseDetails, "", defaultCertsAll);
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);

                                 await expect(registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1))
                                    .to.emit(registry, "ComplianceFlagUpdated")
                                    .withArgs(tokenId1, false);

                                 const batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.compliant).to.equal(true);
                                  expect(batch.flagged).to.equal(false);
                        });

                        it("submitting attestation without required certs keeps non-compliant and flagged true", async function () {
                                  await registry.setAuditorAuthorization(await auditor1.getAddress(), true);

                                 const tx = await registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1);
                                  await tx.wait();

                                 const batch = await registry.getMineralBatch(tokenId1);
                                  expect(batch.compliant).to.equal(false);
                                  expect(batch.flagged).to.equal(true);
                        });
           });

           describe("View functions: getMineralBatch / hasCertification / getAuditReports / getAttestations", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Manganese, baseDetails, tokenURI1, defaultCertsPartial);
                   });

                        describe("getMineralBatch", function () {
                                  it("returns correct mineralType and details", async function () {
                                              const batch = await registry.getMineralBatch(tokenId1);
                                              expect(batch.mineralType).to.equal(MineralType.Manganese);
                                              expect(batch.batchDetails).to.equal(baseDetails);
                                  });

                                       it("returns compliant/flagged reflecting current compliance state", async function () {
                                                   let batch = await registry.getMineralBatch(tokenId1);
                                                   expect(batch.compliant).to.equal(false);
                                                   expect(batch.flagged).to.equal(true);

                                                  await makeCompliant(tokenId1);

                                                  batch = await registry.getMineralBatch(tokenId1);
                                                   expect(batch.compliant).to.equal(true);
                                                   expect(batch.flagged).to.equal(false);
                                       });

                                       it("reverts for non-existent tokenId", async function () {
                                                   await expect(registry.getMineralBatch(777n)).to.be.revertedWith("Token does not exist");
                                       });
                        });

                        describe("hasCertification", function () {
                                  it("returns true for provided certs and false for missing certs", async function () {
                                              expect(await registry.hasCertification(tokenId1, CERT_NO_CHILD_LABOR)).to.equal(true);
                                              expect(await registry.hasCertification(tokenId1, CERT_CONFLICT_FREE)).to.equal(true);
                                              expect(await registry.hasCertification(tokenId1, CERT_ENV_PERMIT)).to.equal(false);
                                  });

                                       it("returns false for arbitrary certification string", async function () {
                                                   expect(await registry.hasCertification(tokenId1, "SomeOtherCert")).to.equal(false);
                                       });

                                       it("reverts for non-existent tokenId", async function () {
                                                   await expect(registry.hasCertification(888n, CERT_NO_CHILD_LABOR)).to.be.revertedWith("Token does not exist");
                                       });
                        });

                        describe("getAuditReports", function () {
                                  it("returns empty arrays when no audit reports linked", async function () {
                                              const res = await registry.getAuditReports(tokenId1);
                                              expect(res.uris.length).to.equal(0);
                                              expect(res.timestamps.length).to.equal(0);
                                  });

                                       it("returns arrays with matching lengths after linking reports", async function () {
                                                   await registry.linkAuditReport(tokenId1, auditURI1);
                                                   await registry.linkAuditReport(tokenId1, auditURI2);

                                                  const res = await registry.getAuditReports(tokenId1);
                                                   expect(res.uris.length).to.equal(2);
                                                   expect(res.timestamps.length).to.equal(2);
                                       });

                                       it("reverts for non-existent tokenId", async function () {
                                                   await expect(registry.getAuditReports(999n)).to.be.revertedWith("Token does not exist");
                                       });
                        });

                        describe("getAttestations", function () {
                                  it("returns empty arrays when no attestations", async function () {
                                              const res = await registry.getAttestations(tokenId1);
                                              expect(res.auditors.length).to.equal(0);
                                              expect(res.details.length).to.equal(0);
                                              expect(res.timestamps.length).to.equal(0);
                                  });

                                       it("returns submitted attestations", async function () {
                                                   await registry.setAuditorAuthorization(await auditor1.getAddress(), true);
                                                   await registry.connect(auditor1).submitAttestation(tokenId1, attestDetails1);

                                                  const res = await registry.getAttestations(tokenId1);
                                                   expect(res.auditors.length).to.equal(1);
                                                   expect(res.details.length).to.equal(1);
                                                   expect(res.timestamps.length).to.equal(1);

                                                  expect(res.auditors[0]).to.equal(await auditor1.getAddress());
                                                   expect(res.details[0]).to.equal(attestDetails1);
                                                   expect(res.timestamps[0]).to.be.greaterThan(0);
                                       });

                                       it("reverts for non-existent tokenId", async function () {
                                                   await expect(registry.getAttestations(1000n)).to.be.revertedWith("Token does not exist");
                                       });
                        });
           });

           describe("Transfers compliance enforcement via _update override", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsAll);
                   });

                        it("reverts transferFrom when token is non-compliant (no attestation)", async function () {
                                  await expect(
                                              registry.connect(alice).transferFrom(await alice.getAddress(), await bob.getAddress(), tokenId1)
                                            ).to.be.revertedWith("Token is non-compliant and cannot be transferred");
                        });

                        it("allows transferFrom after becoming compliant; emits MineralBatchTransferred", async function () {
                                  await makeCompliant(tokenId1);

                                 await expect(
                                             registry.connect(alice).transferFrom(await alice.getAddress(), await bob.getAddress(), tokenId1)
                                           )
                                    .to.emit(registry, "MineralBatchTransferred")
                                    .withArgs(await alice.getAddress(), await bob.getAddress(), tokenId1);

                                 expect(await registry.ownerOf(tokenId1)).to.equal(await bob.getAddress());
                        });

                        it("safeTransferFrom also enforces compliance", async function () {
                                  await expect(
                                              registry.connect(alice)["safeTransferFrom(address,address,uint256)"](
                                                            await alice.getAddress(),
                                                            await bob.getAddress(),
                                                            tokenId1
                                                          )
                                            ).to.be.revertedWith("Token is non-compliant and cannot be transferred");
                        });

                        it("approval does not bypass compliance check", async function () {
                                  await registry.connect(alice).approve(await bob.getAddress(), tokenId1);

                                 await expect(
                                             registry.connect(bob).transferFrom(await alice.getAddress(), await bob.getAddress(), tokenId1)
                                           ).to.be.revertedWith("Token is non-compliant and cannot be transferred");
                        });

                        it("minting does not emit MineralBatchTransferred (from == 0)", async function () {
                                  const to = await alice.getAddress();
                                  const tx = await registry.mintMineralBatch(to, MineralType.Nickel, baseDetails, tokenURI1, defaultCertsNone);
                                  const receipt = await tx.wait();

                                 const transferredEvents = await registry.queryFilter(
                                             registry.filters.MineralBatchTransferred(),
                                             receipt.blockNumber,
                                             receipt.blockNumber
                                           );
                                  expect(transferredEvents.length).to.equal(0);
                        });
           });

           describe("burn", function () {
                   beforeEach(async function () {
                             tokenId1 = await mintTo(alice, MineralType.Cobalt, baseDetails, tokenURI1, defaultCertsAll);
                   });

                        it("token owner can burn; token no longer exists", async function () {
                                  await registry.connect(alice).burn(tokenId1);

                                 await expect(registry.ownerOf(tokenId1)).to.revert(ethers);
                                  await expect(registry.getMineralBatch(tokenId1)).to.be.revertedWith("Token does not exist");
                                  await expect(registry.getAuditReports(tokenId1)).to.be.revertedWith("Token does not exist");
                                  await expect(registry.getAttestations(tokenId1)).to.be.revertedWith("Token does not exist");
                                  await expect(registry.hasCertification(tokenId1, CERT_NO_CHILD_LABOR)).to.be.revertedWith("Token does not exist");
                        });

                        it("approved address can burn", async function () {
                                  await registry.connect(alice).approve(await bob.getAddress(), tokenId1);
                                  await registry.connect(bob).burn(tokenId1);

                                 await expect(registry.ownerOf(tokenId1)).to.revert(ethers);
                        });

                        it("operator can burn", async function () {
                                  await registry.connect(alice).setApprovalForAll(await bob.getAddress(), true);
                                  await registry.connect(bob).burn(tokenId1);

                                 await expect(registry.ownerOf(tokenId1)).to.revert(ethers);
                        });

                        it("reverts when caller is not owner/approved/operator", async function () {
                                  await expect(registry.connect(bob).burn(tokenId1)).to.be.revertedWith("Not authorized to burn");
                        });

                        it("reverts for non-existent tokenId", async function () {
                                  await expect(registry.burn(99999n)).to.be.revertedWith("Token does not exist");
                        });

                        it("burn clears tokenURI storage (tokenURI should revert after burn)", async function () {
                                  expect(await registry.tokenURI(tokenId1)).to.equal(tokenURI1);

                                 await registry.connect(alice).burn(tokenId1);
                                  await expect(registry.tokenURI(tokenId1)).to.revert(ethers);
                        });

                        it("burn does not emit MineralBatchTransferred (to == 0)", async function () {
                            

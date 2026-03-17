// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SovereignMatterRegistry
 * @notice ERC721 "material passport" registry for EV-battery minerals (cobalt, nickel, lithium, manganese, graphite).
 */
contract SovereignMatterRegistry is ERC721URIStorage, Ownable {
    uint256 private _tokenIdCounter;

    enum MineralType { Cobalt, Nickel, Lithium, Manganese, Graphite }

    struct MineralBatch {
        MineralType mineralType;
        string batchDetails;
        bool compliant;
        bool flagged;
    }

    struct AuditReport {
        string uri;
        uint256 timestamp;
    }

    struct Attestation {
        address auditor;
        string details;
        uint256 timestamp;
    }

    mapping(uint256 => MineralBatch) private _mineralBatches;
    mapping(uint256 => AuditReport[]) private _auditReports;
    mapping(uint256 => Attestation[]) private _attestations;
    mapping(address => bool) private _authorizedAuditors;
    mapping(uint256 => mapping(string => bool)) private _certifications;

    event MineralBatchMinted(uint256 indexed tokenId, address indexed owner, MineralType mineralType, string batchDetails);
    event MineralBatchUpdated(uint256 indexed tokenId, string batchDetails);
    event CertificationUpdated(uint256 indexed tokenId, string certification, bool present);
    event AuditReportLinked(uint256 indexed tokenId, string uri, uint256 timestamp);
    event AttestationSubmitted(uint256 indexed tokenId, address indexed auditor, string details, uint256 timestamp);
    event ComplianceFlagUpdated(uint256 indexed tokenId, bool flagged);
    event MineralBatchTransferred(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuditorAuthorized(address indexed auditor, bool authorized);

    modifier tokenExists(uint256 tokenId) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _;
    }

    modifier onlyAuthorizedAuditor() {
        require(_authorizedAuditors[msg.sender], "Not an authorized auditor");
        _;
    }

    constructor() ERC721("SovereignMatterRegistry", "SMR") Ownable(msg.sender) {}

    function mintMineralBatch(address to, MineralType mineralType, string calldata batchDetails, string calldata tokenURI_, string[] calldata certifications) external onlyOwner returns (uint256) {
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        _safeMint(to, newTokenId);
        if (bytes(tokenURI_).length > 0) { _setTokenURI(newTokenId, tokenURI_); }
        _mineralBatches[newTokenId] = MineralBatch({ mineralType: mineralType, batchDetails: batchDetails, compliant: false, flagged: false });
        for (uint256 i = 0; i < certifications.length; i++) { _certifications[newTokenId][certifications[i]] = true; emit CertificationUpdated(newTokenId, certifications[i], true); }
        _updateComplianceStatus(newTokenId);
        emit MineralBatchMinted(newTokenId, to, mineralType, batchDetails);
        return newTokenId;
    }

    function updateMineralBatch(uint256 tokenId, string calldata newBatchDetails, string calldata newTokenURI, string[] calldata certifications) external tokenExists(tokenId) {
        address owner_ = ownerOf(tokenId);
        require(msg.sender == owner_ || isApprovedForAll(owner_, msg.sender) || getApproved(tokenId) == msg.sender, "Not authorized to update");
        _mineralBatches[tokenId].batchDetails = newBatchDetails;
        if (bytes(newTokenURI).length > 0) { _setTokenURI(tokenId, newTokenURI); }
        for (uint256 i = 0; i < certifications.length; i++) { _certifications[tokenId][certifications[i]] = true; emit CertificationUpdated(tokenId, certifications[i], true); }
        _updateComplianceStatus(tokenId);
        emit MineralBatchUpdated(tokenId, newBatchDetails);
    }

    function linkAuditReport(uint256 tokenId, string calldata uri) external tokenExists(tokenId) onlyOwner {
        _auditReports[tokenId].push(AuditReport({uri: uri, timestamp: block.timestamp}));
        emit AuditReportLinked(tokenId, uri, block.timestamp);
        _updateComplianceStatus(tokenId);
    }

    function submitAttestation(uint256 tokenId, string calldata details) external tokenExists(tokenId) onlyAuthorizedAuditor {
        _attestations[tokenId].push(Attestation({auditor: msg.sender, details: details, timestamp: block.timestamp}));
        emit AttestationSubmitted(tokenId, msg.sender, details, block.timestamp);
        _updateComplianceStatus(tokenId);
    }

    function setAuditorAuthorization(address auditor, bool authorized) external onlyOwner {
        _authorizedAuditors[auditor] = authorized;
        emit AuditorAuthorized(auditor, authorized);
    }

    function getMineralBatch(uint256 tokenId) external view tokenExists(tokenId) returns (MineralType mineralType, string memory batchDetails, bool compliant, bool flagged) {
        MineralBatch memory batch = _mineralBatches[tokenId];
        return (batch.mineralType, batch.batchDetails, batch.compliant, batch.flagged);
    }

    function getAuditReports(uint256 tokenId) external view tokenExists(tokenId) returns (string[] memory uris, uint256[] memory timestamps) {
        AuditReport[] memory reports = _auditReports[tokenId];
        uris = new string[](reports.length);
        timestamps = new uint256[](reports.length);
        for (uint256 i = 0; i < reports.length; i++) { uris[i] = reports[i].uri; timestamps[i] = reports[i].timestamp; }
    }

    function getAttestations(uint256 tokenId) external view tokenExists(tokenId) returns (address[] memory auditors, string[] memory details, uint256[] memory timestamps) {
        Attestation[] memory attestations_ = _attestations[tokenId];
        auditors = new address[](attestations_.length);
        details = new string[](attestations_.length);
        timestamps = new uint256[](attestations_.length);
        for (uint256 i = 0; i < attestations_.length; i++) { auditors[i] = attestations_[i].auditor; details[i] = attestations_[i].details; timestamps[i] = attestations_[i].timestamp; }
    }

    function hasCertification(uint256 tokenId, string calldata certification) external view tokenExists(tokenId) returns (bool present) {
        return _certifications[tokenId][certification];
    }

    function burn(uint256 tokenId) external tokenExists(tokenId) {
        address owner_ = ownerOf(tokenId);
        require(msg.sender == owner_ || isApprovedForAll(owner_, msg.sender) || getApproved(tokenId) == msg.sender, "Not authorized to burn");
        _burn(tokenId);
        delete _mineralBatches[tokenId];
        delete _auditReports[tokenId];
        delete _attestations[tokenId];
    }

    function _updateComplianceStatus(uint256 tokenId) internal {
        MineralBatch storage batch = _mineralBatches[tokenId];
        string[3] memory requiredCertifications = ["NoChildLabor", "ConflictFree", "EnvironmentalPermit"];
        bool allCertificationsPresent = true;
        for (uint256 i = 0; i < requiredCertifications.length; i++) {
            if (!_certifications[tokenId][requiredCertifications[i]]) { allCertificationsPresent = false; break; }
        }
        bool hasValidAttestation = _attestations[tokenId].length > 0;
        bool newCompliance = allCertificationsPresent && hasValidAttestation;
        batch.compliant = newCompliance;
        bool newFlagged = !newCompliance;
        if (batch.flagged != newFlagged) { batch.flagged = newFlagged; emit ComplianceFlagUpdated(tokenId, newFlagged); }
    }

    function _beforeTokenTransferComplianceCheck(uint256 tokenId) internal view {
        MineralBatch memory batch = _mineralBatches[tokenId];
        require(batch.compliant, "Token is non-compliant and cannot be transferred");
        require(!batch.flagged, "Token is flagged for non-compliance");
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && to != address(0)) {
            _beforeTokenTransferComplianceCheck(tokenId);
            emit MineralBatchTransferred(from, to, tokenId);
        }
    }
}

import "server-only";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

// OpenSSH keys are sequences of uint32 and length-prefixed strings (RFC 4251 §5).
function sshReader(buffer: Buffer, offset = 0) {
  const uint32 = () => {
    offset += 4;
    return buffer.readUInt32BE(offset - 4);
  };
  const string = () => {
    const length = uint32();
    offset += length;
    return buffer.subarray(offset - length, offset);
  };
  return { uint32, string };
}

const MAGIC = "openssh-key-v1\0";
const keyError = "DEVFEST_TICKET_PRIVATE_KEY must be an unencrypted OpenSSH ed25519 key";

let privateKey: KeyObject | undefined;

// node:crypto can't read the OpenSSH private key format, so extract the ed25519 seed by hand.
function getPrivateKey() {
  if (privateKey) return privateKey;
  const buffer = Buffer.from(
    (process.env.DEVFEST_TICKET_PRIVATE_KEY ?? "").replace(/-----[^-]+-----|\s/g, ""),
    "base64",
  );
  if (buffer.toString("latin1", 0, MAGIC.length) !== MAGIC) throw new Error(keyError);
  const file = sshReader(buffer, MAGIC.length);
  const cipher = file.string().toString();
  file.string(); // kdf name
  file.string(); // kdf options
  file.uint32(); // key count
  file.string(); // public key
  const secret = sshReader(file.string(), 8); // skip the two check ints
  const type = secret.string().toString();
  const x = secret.string();
  const d = secret.string().subarray(0, 32); // seed, followed by the public key
  if (cipher !== "none" || type !== "ssh-ed25519") throw new Error(keyError);
  privateKey = createPrivateKey({
    key: { kty: "OKP", crv: "Ed25519", x: x.toString("base64url"), d: d.toString("base64url") },
    format: "jwk",
  });
  return privateKey;
}

/** Signs the email; the ticket is base64url(JSON.stringify({ email, signature })). */
export function createTicket(email: string) {
  const signature = sign(null, Buffer.from(email), getPrivateKey()).toString("base64url");
  const ticket = Buffer.from(JSON.stringify({ email, signature })).toString("base64url");
  return { signature, ticket };
}

/** Raw 32-byte ed25519 key (base64url) from the `ssh-ed25519 AAAA… comment` line. */
export function getTicketPublicKey() {
  const [type, blob = ""] = (process.env.DEVFEST_TICKET_PUBLIC_KEY ?? "").trim().split(/\s+/);
  const key = Buffer.from(blob, "base64"); // string "ssh-ed25519" + string <32-byte key>
  if (type !== "ssh-ed25519" || key.length !== 51) {
    throw new Error("DEVFEST_TICKET_PUBLIC_KEY must be an OpenSSH ed25519 public key");
  }
  return key.subarray(-32).toString("base64url");
}

import type {
  AdminPropertyStatus,
  AdminPropertySummary,
  AdminRoomSummary,
} from '@/server/admin-directory';
import type { OwnerSummary } from '@/server/admin-owners';
import type { DeviceAccountInput, DeviceCredential } from '@/server/manage-device';
import type { CreateOwnerInput } from '@/server/manage-owner';
import type { RegisterRoomInput } from '@/server/register-room';
import type { AdminOperations } from './admin-operations';

/** In-memory fake for tests and previews — never imported by production code. */
export class FakeAdminOperations implements AdminOperations {
  statuses: AdminPropertyStatus[] = [];
  properties: AdminPropertySummary[] = [];
  roomsByProperty: Record<string, AdminRoomSummary[]> = {};
  registrations: RegisterRoomInput[] = [];
  owners: OwnerSummary[] = [];
  deviceCreates: DeviceAccountInput[] = [];
  deviceResets: DeviceAccountInput[] = [];
  failWith: string | null = null;
  resetLink = 'https://example.test/reset?oobCode=fake';
  nextDevicePassword = 'fake-device-password';
  private nextUid = 1;
  private nextDeviceUid = 1;

  private guard() {
    if (this.failWith) throw new Error(this.failWith);
  }

  async fleetStatus(): Promise<AdminPropertyStatus[]> {
    this.guard();
    return this.statuses;
  }

  async listProperties(): Promise<AdminPropertySummary[]> {
    this.guard();
    return this.properties;
  }

  async listRooms(propertyId: string): Promise<AdminRoomSummary[]> {
    this.guard();
    return this.roomsByProperty[propertyId] ?? [];
  }

  async registerRoom(input: RegisterRoomInput): Promise<void> {
    this.guard();
    this.registrations.push(input);
  }

  async listOwners(): Promise<OwnerSummary[]> {
    this.guard();
    return this.owners;
  }

  async createOwner(input: CreateOwnerInput): Promise<{ uid: string }> {
    this.guard();
    const uid = `uid_${this.nextUid++}`;
    this.owners.push({ uid, email: input.email, disabled: false, propertyIds: [input.propertyId] });
    return { uid };
  }

  async assignOwnerToProperty(uid: string, propertyId: string): Promise<void> {
    this.guard();
    const owner = this.owners.find((o) => o.uid === uid);
    if (owner && !owner.propertyIds.includes(propertyId)) owner.propertyIds.push(propertyId);
  }

  async removeOwnerFromProperty(uid: string, propertyId: string): Promise<void> {
    this.guard();
    const owner = this.owners.find((o) => o.uid === uid);
    if (owner) owner.propertyIds = owner.propertyIds.filter((pid) => pid !== propertyId);
  }

  async setOwnerDisabled(uid: string, disabled: boolean): Promise<void> {
    this.guard();
    const owner = this.owners.find((o) => o.uid === uid);
    if (owner) owner.disabled = disabled;
  }

  async resetOwnerPassword(_email: string): Promise<{ resetLink: string }> {
    this.guard();
    return { resetLink: this.resetLink };
  }

  async createDeviceAccount(input: DeviceAccountInput): Promise<DeviceCredential> {
    this.guard();
    this.deviceCreates.push(input);
    return this.deviceCredential(input);
  }

  async resetDeviceCredential(input: DeviceAccountInput): Promise<DeviceCredential> {
    this.guard();
    this.deviceResets.push(input);
    return this.deviceCredential(input);
  }

  private deviceCredential(input: DeviceAccountInput): DeviceCredential {
    return {
      uid: `device_uid_${this.nextDeviceUid++}`,
      email: `device+${input.propertyId}+${input.roomId}@devices.ecostay.local`,
      password: this.nextDevicePassword,
    };
  }
}

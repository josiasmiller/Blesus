import { useState } from "react";
import { User, Users, Server } from "lucide-react";
import { TabButton, type Tab } from "./addressbook/shared";
import { ContactsTab } from "./addressbook/ContactsTab";
import { GroupsTab } from "./addressbook/GroupsTab";
import { CardDavTab } from "./addressbook/CardDavTab";

export function AddressBook() {
  const [tab, setTab] = useState<Tab>("contacts");

  return (
    <div className="flex flex-col gap-0 -mx-10 -my-8">
      <div className="flex gap-6 border-b border-soft px-10 pt-6 pb-0 shrink-0">
        <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")}>
          <User size={13} />
          Contacts
        </TabButton>
        <TabButton active={tab === "groups"} onClick={() => setTab("groups")}>
          <Users size={13} />
          Groups
        </TabButton>
        <TabButton active={tab === "carddav"} onClick={() => setTab("carddav")}>
          <Server size={13} />
          CardDAV Sync
        </TabButton>
      </div>

      {tab === "contacts" && <ContactsTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "carddav" && <CardDavTab />}
    </div>
  );
}

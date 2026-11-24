"use client";

import { Button, Form, Input, Select, DatePicker, Spin } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";

const { Item } = Form;
const { TextArea } = Input;

const optional = { title: "Optional", icon: <InfoCircleOutlined /> };

// Registration is closed: the form is kept for display only and never submits.
export default function RegisterForm() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`mx-auto max-w-6xl w-full bg-white rounded-xl px-6 py-8 sm:px-12 sm:py-16 shadow-lg space-y-6 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold">Register for Event Ticket</h1>
        <h2>
          {
            "Don't miss out on this opportunity to be part of an exciting event!"
          }
        </h2>
      </div>
      {/* Same wrapper markup as the live form had. */}
      <Spin spinning={false}>
      <Form
        layout="vertical"
        size="large"
        className="grid grid-cols-2 gap-x-4 sm:gap-x-8"
      >
        <Item label="Full Name" className="col-span-2">
          <Input placeholder="John Doe" suffix={<></>} />
        </Item>

        <Item label="Year of Birth">
          <DatePicker picker="year" placeholder="YYYY" className="w-full" />
        </Item>

        <Item label="Gender">
          <Select
            allowClear
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
            ]}
            placeholder="Select gender"
          />
        </Item>

        <Item label="Email" className="col-span-2 sm:col-span-1">
          <Input placeholder="example@mail.com" suffix={<></>} />
        </Item>

        <Item label="Years of Experience" className="col-span-2 sm:col-span-1">
          <Select
            options={[
              { value: "0-1", label: "0 - 1" },
              { value: "1-2", label: "1 - 2" },
              { value: "2-3", label: "2 - 3" },
              { value: "3-4", label: "3 - 4" },
              { value: "4-5", label: "4 - 5" },
              { value: "5+", label: "5+" },
            ]}
            placeholder="Select experience"
          />
        </Item>

        <Item label="Job Title" className="col-span-2 sm:col-span-1">
          <Input placeholder="Cloud Engineer" suffix={<></>} />
        </Item>

        <Item label="Sessions" className="col-span-2 sm:col-span-1">
          <Select
            options={[
              { value: "morning", label: "Morning Workshop" },
              { value: "afternoon", label: "Afternoon Tech Conference" },
              { value: "both", label: "Both of them" },
            ]}
            placeholder="Select sessions"
          />
        </Item>

        <Item
          label="Phone Number"
          tooltip={optional}
          className="col-span-2 sm:col-span-1"
        >
          <Input placeholder="0123456789" />
        </Item>

        <Item
          label="Company Email"
          tooltip={optional}
          className="col-span-2 sm:col-span-1"
        >
          <Input placeholder="name@company.com" />
        </Item>

        <Item label="LinkedIn" tooltip={optional} className="col-span-2">
          <Input placeholder="https://www.linkedin.com/in/yourprofile" />
        </Item>

        <Item
          label="Questions for Organizer"
          tooltip={optional}
          className="col-span-2"
        >
          <TextArea placeholder="Do you have any questions for the organizers?" />
        </Item>

        <Button
          block
          disabled
          type="primary"
          className="w-full h-12 rounded-xl bg-[#34a853]/80 hover:bg-[#34a853]/90 text-white font-bold col-span-2 hover:shadow-lg"
        >
          Registration closed
        </Button>
      </Form>
      </Spin>
    </div>
  );
}

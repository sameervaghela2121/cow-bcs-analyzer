jest.mock('nodemailer');
const nodemailer = require('nodemailer');

describe('emailService.sendInviteEmail', () => {
  it('sends an email with the invite link in the body', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const { sendInviteEmail } = require('../../src/services/emailService');
    await sendInviteEmail({
      to: 'newstaff@example.com',
      name: 'New Staff',
      inviteUrl: 'https://app.example.com/accept-invite?token=abc123&email=newstaff%40example.com',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('newstaff@example.com');
    expect(call.html).toContain('abc123');
  });
});

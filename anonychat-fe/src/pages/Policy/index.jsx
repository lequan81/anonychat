import { memo } from 'react';
import { Link } from 'react-router-dom';

const Policy = memo(() => {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors mb-4"
          >
            ← Back to Chat
          </Link>
          <h1 className="text-3xl font-bold text-purple-400">Privacy Policy</h1>
        </div>

        <div className="space-y-6 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Data Collection</h2>
            <p>
              AnonyChat does not collect, store, or process any personal information. We do not require registration,
              email addresses, or any identifying information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Chat Messages</h2>
            <p>
              Chat messages are transmitted in real-time but are not stored on our servers. Once a chat session ends,
              all messages are permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Technical Information</h2>
            <p>
              We may temporarily store minimal technical information such as IP addresses for connection purposes and to
              prevent abuse. This information is not linked to any personal identity and is deleted after the session.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Cookies</h2>
            <p>AnonyChat does not use cookies or any tracking technologies.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Third Parties</h2>
            <p>
              We do not share any information with third parties as we don't collect any personal information to begin
              with.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>If you have any questions about this privacy policy, please contact us through our GitHub repository.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Updates</h2>
            <p>This privacy policy may be updated from time to time. Any changes will be posted on this page.</p>
          </section>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Start Chatting
          </Link>
        </div>
      </div>
    </div>
  );
});

export default Policy;

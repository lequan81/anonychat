import { memo } from 'react';
import { Link } from 'react-router-dom';

const About = memo(() => {
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
          <h1 className="text-3xl font-bold text-purple-400">About AnonyChat</h1>
        </div>

        <div className="space-y-6 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">What is AnonyChat?</h2>
            <p>
              AnonyChat is a simple, anonymous chat platform that connects you with random strangers for real-time
              conversations. No registration required, no personal information stored.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Features</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Anonymous chat with random strangers</li>
              <li>Real-time messaging</li>
              <li>No registration or personal data required</li>
              <li>Sound notifications for new messages</li>
              <li>Mobile-friendly interface</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How to Use</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>Visit the chat page</li>
              <li>Wait to be connected with a stranger</li>
              <li>Start chatting!</li>
              <li>If you want to talk to someone new, refresh the page</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Safety</h2>
            <p>
              Please chat responsibly. Do not share personal information, and report any inappropriate behavior.
              Remember that conversations are not moderated.
            </p>
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

export default About;

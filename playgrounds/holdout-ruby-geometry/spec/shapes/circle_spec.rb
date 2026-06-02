# frozen_string_literal: true

require_relative "../../lib/shapes/circle"

RSpec.describe Geometry::Shapes::Circle do
  let(:center) { [0.0, 0.0] }
  subject(:circle) { described_class.new(center, 2.0) }

  describe "#area" do
    it "computes pi * r^2" do
      expect(circle.area).to be_within(1e-9).of(Math::PI * 4)
    end
  end

  describe "#circumference" do
    it "computes 2 * pi * r" do
      expect(circle.circumference).to be_within(1e-9).of(4 * Math::PI)
    end

    it "is aliased as perimeter" do
      expect(circle.perimeter).to eq(circle.circumference)
    end
  end

  describe "#scale" do
    it "scales the radius by the factor" do
      expect(circle.scale(3).radius).to eq(6.0)
    end
  end

  it "rejects a non-positive radius" do
    expect { described_class.new(center, 0) }.to raise_error(ArgumentError)
  end
end
